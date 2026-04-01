"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import type { UnoccupiedBlock } from "@/lib/schema";
import { OccupancyTimeline } from "@/app/components/OccupancyTimeline";
import { UnoccupiedBlocksBuilder } from "@/app/components/UnoccupiedBlocksBuilder";

type Direction   = "N" | "S" | "E" | "W";
type WindowSize  = "SMALL" | "MEDIUM" | "LARGE";
type GlazingType = "SINGLE" | "DOUBLE" | "TRIPLE";
type Insulation  = "BELOW_CODE" | "AT_CODE" | "ABOVE_CODE";
type Orientation = "NS" | "EW";
type OccLevel    = "ONE_TWO" | "THREE_FOUR";
type HeatSource  = "MINIMAL" | "LIGHT_ELECTRONICS" | "HOME_OFFICE" | "KITCHEN_LAUNDRY";
type SurfaceColor = "LIGHT" | "MEDIUM" | "DARK";
type RoofType    = "ATTIC_BUFFERED" | "FLAT_VAULTED" | "DIRECT_EXPOSED";

interface WindowEntry { id:string; size:WindowSize; direction:Direction; glazingOverride?:GlazingType; }

interface FormData {
  roomName:string; floorNumber:number; isTopFloor:boolean|null;
  lengthFt:string; widthFt:string; ceilingHeightFt:string; orientation:Orientation|"";
  insulationLevel:Insulation|""; glazingType:GlazingType|""; hasCrossBreeze:boolean|null;
  wallColor:SurfaceColor; roofColor:SurfaceColor; roofType:RoofType|"";
  windows:WindowEntry[]; exteriorWalls:Direction[];
  occupancyLevel:OccLevel;
  unoccupiedBlocks:UnoccupiedBlock[];
  heatSourceLevel:HeatSource|"";
  minTempF:number; maxTempF:number; minHumidity:number; maxHumidity:number;
}

const STEPS = ["Room Identity","Dimensions","Envelope","Windows","Exterior Walls","Occupancy","Heat Sources","Comfort Targets","Review"];
const INSULATION_OPTS = [
  {value:"BELOW_CODE" as Insulation,label:"Below Code",desc:"Older home, minimal insulation"},
  {value:"AT_CODE"    as Insulation,label:"At Code",    desc:"Standard modern construction"},
  {value:"ABOVE_CODE" as Insulation,label:"Above Code", desc:"Spray foam / upgraded"},
];
const GLAZING_OPTS = [
  {value:"SINGLE" as GlazingType,label:"Single pane",u:"U=0.90"},
  {value:"DOUBLE" as GlazingType,label:"Double pane",u:"U=0.30"},
  {value:"TRIPLE" as GlazingType,label:"Triple pane",u:"U=0.15"},
];
const WINDOW_SIZE_OPTS = [
  {value:"SMALL"  as WindowSize,label:"Small",  area:"≈ 4 ft²"},
  {value:"MEDIUM" as WindowSize,label:"Medium", area:"≈ 10 ft²"},
  {value:"LARGE"  as WindowSize,label:"Large",  area:"≈ 20 ft²"},
];
const HEAT_OPTS = [
  {value:"MINIMAL"           as HeatSource,label:"Minimal",          desc:"Phone charger, a lamp",          rate:"+0.5"},
  {value:"LIGHT_ELECTRONICS" as HeatSource,label:"Light electronics",desc:"TV, laptop, streaming device",    rate:"+1.5"},
  {value:"HOME_OFFICE"       as HeatSource,label:"Home office",      desc:"Desktop PC, multiple monitors",   rate:"+3.0"},
  {value:"KITCHEN_LAUNDRY"   as HeatSource,label:"Kitchen/laundry",  desc:"Cooking appliances, washer/dryer",rate:"+5.0"},
];

function Label({children,hint}:{children:React.ReactNode;hint?:string}) {
  return <div className="mb-1.5"><label className="block text-sm font-semibold" style={{color:"var(--navy)"}}>{children}</label>{hint&&<p className="text-xs mt-0.5" style={{color:"var(--muted)"}}>{hint}</p>}</div>;
}
function RadioCard({selected,onClick,label,desc,badge}:{selected:boolean;onClick:()=>void;label:string;desc?:string;badge?:string}) {
  return (
    <button type="button" className={`option-pill w-full flex items-start gap-3 text-left ${selected?"selected":""}`} style={{padding:"12px 16px"}} onClick={onClick}>
      <span className="text-base leading-none mt-0.5 shrink-0">{selected?"●":"○"}</span>
      <span className="flex-1"><span className="font-semibold">{label}</span>{badge&&<span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{background:"var(--sky-light)",color:"var(--sky)"}}>{badge}</span>}{desc&&<span className="block text-xs mt-0.5" style={{color:"var(--muted)",fontWeight:400}}>{desc}</span>}</span>
    </button>
  );
}
function CompassGrid({selected,onToggle}:{selected:Direction[];onToggle:(d:Direction)=>void}) {
  return (
    <div className="grid gap-2" style={{gridTemplateColumns:"52px 52px 52px",gridTemplateRows:"52px 52px 52px",width:"fit-content"}}>
      <div/><button type="button" className={`compass-btn ${selected.includes("N")?"selected":""}`} onClick={()=>onToggle("N")}>N</button><div/>
      <button type="button" className={`compass-btn ${selected.includes("W")?"selected":""}`} onClick={()=>onToggle("W")}>W</button>
      <div className="flex items-center justify-center" style={{background:"var(--cream-dark)",borderRadius:8}}><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2" fill="var(--muted)"/><line x1="10" y1="2" x2="10" y2="6" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"/><line x1="10" y1="14" x2="10" y2="18" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="10" x2="6" y2="10" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"/><line x1="14" y1="10" x2="18" y2="10" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
      <button type="button" className={`compass-btn ${selected.includes("E")?"selected":""}`} onClick={()=>onToggle("E")}>E</button>
      <div/><button type="button" className={`compass-btn ${selected.includes("S")?"selected":""}`} onClick={()=>onToggle("S")}>S</button><div/>
    </div>
  );
}

export default function EditRoomPage() {
  const {id}=useParams<{id:string}>(); const router=useRouter();
  const [step,setStep]=useState(0); const [error,setError]=useState("");
  const [loading,setLoading]=useState(false); const [fetching,setFetching]=useState(true);
  const [userEmail,setUserEmail]=useState("");
  const [pendingWin,setPendingWin]=useState<{size:WindowSize|"";direction:Direction|"";glazingOverride:GlazingType|"useRoom"}>({size:"",direction:"",glazingOverride:"useRoom"});

  const [form,setForm]=useState<FormData>({
    roomName:"",floorNumber:1,isTopFloor:null,
    lengthFt:"",widthFt:"",ceilingHeightFt:"",orientation:"",
    insulationLevel:"",glazingType:"",hasCrossBreeze:null,
    wallColor:"MEDIUM",roofColor:"MEDIUM",roofType:"",
    windows:[],exteriorWalls:[],
    occupancyLevel:"ONE_TWO",unoccupiedBlocks:[],
    heatSourceLevel:"",
    minTempF:68,maxTempF:74,minHumidity:40,maxHumidity:55,
  });

  useEffect(()=>{
    fetch(`/api/rooms/${id}`).then(r=>r.json()).then(d=>{
      if(d.error){setError(d.error);return;}
      const r=d.room; setUserEmail(d.userEmail??"");
      setForm({
        roomName:r.name,floorNumber:r.floorNumber,isTopFloor:r.isTopFloor,
        lengthFt:String(r.lengthFt),widthFt:String(r.widthFt),ceilingHeightFt:String(r.ceilingHeightFt),
        orientation:r.orientation,insulationLevel:r.insulationLevel,glazingType:r.glazingType,hasCrossBreeze:r.hasCrossBreeze,
        wallColor:r.wallColor??"MEDIUM",roofColor:r.roofColor??"MEDIUM",roofType:r.roofType??"ATTIC_BUFFERED",
        windows:r.windows.map((w:{size:WindowSize;direction:Direction;glazingOverride?:GlazingType})=>({...w,id:crypto.randomUUID()})),
        exteriorWalls:r.exteriorWalls.map((w:{direction:Direction})=>w.direction),
        occupancyLevel:r.occupancyLevel??"ONE_TWO",
        unoccupiedBlocks:Array.isArray(r.unoccupiedBlocks)?r.unoccupiedBlocks:[],
        heatSourceLevel:r.heatSourceLevel,
        minTempF:r.minTempF,maxTempF:r.maxTempF,minHumidity:r.minHumidity,maxHumidity:r.maxHumidity,
      });
    }).catch(()=>setError("Failed to load room.")).finally(()=>setFetching(false));
  },[id]);

  function set<K extends keyof FormData>(key:K,value:FormData[K]){setForm(prev=>({...prev,[key]:value}));setError("");}

  function validate():string {
    switch(step){
      case 0: if(!form.roomName.trim())return"Give this room a name."; if(form.isTopFloor===null)return"Indicate top floor."; break;
      case 1:{const l=parseFloat(form.lengthFt),w=parseFloat(form.widthFt),h=parseFloat(form.ceilingHeightFt);if(!l||l<=0)return"Valid length.";if(!w||w<=0)return"Valid width.";if(!h||h<=0||h>30)return"Valid ceiling height.";if(!form.orientation)return"Select orientation.";break;}
      case 2: if(!form.insulationLevel)return"Select insulation.";if(!form.glazingType)return"Select glazing.";if(form.hasCrossBreeze===null)return"Indicate cross-breeze.";if(!form.roofType)return"Select roof type.";break;
      case 3: if(!form.windows.length)return"Add at least one window.";break;
      case 4: if(!form.exteriorWalls.length)return"Select at least one exterior wall.";break;
      case 5:{const bad=form.unoccupiedBlocks.filter(b=>b.endHour<=b.startHour);if(bad.length)return"End time must be after start time.";break;}
      case 6: if(!form.heatSourceLevel)return"Select heat source.";break;
      case 7: if(form.minTempF>=form.maxTempF)return"Min temp must be below max.";if(form.minHumidity>=form.maxHumidity)return"Min humidity must be below max.";break;
    }
    return"";
  }

  function next(){const e=validate();if(e){setError(e);return;}setError("");setStep(s=>s+1);}
  function back(){setError("");setStep(s=>s-1);}
  function addWindow(){if(!pendingWin.size||!pendingWin.direction)return;set("windows",[...form.windows,{id:crypto.randomUUID(),size:pendingWin.size as WindowSize,direction:pendingWin.direction as Direction,glazingOverride:pendingWin.glazingOverride!=="useRoom"?pendingWin.glazingOverride as GlazingType:undefined}]);setPendingWin({size:"",direction:"",glazingOverride:"useRoom"});}
  function toggleWall(dir:Direction){set("exteriorWalls",form.exteriorWalls.includes(dir)?form.exteriorWalls.filter(d=>d!==dir):[...form.exteriorWalls,dir]);}

  async function submit(){
    setLoading(true);setError("");
    try{
      const res=await fetch(`/api/rooms/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        roomName:form.roomName.trim(),floorNumber:form.floorNumber,isTopFloor:form.isTopFloor,
        lengthFt:parseFloat(form.lengthFt),widthFt:parseFloat(form.widthFt),ceilingHeightFt:parseFloat(form.ceilingHeightFt),
        orientation:form.orientation,insulationLevel:form.insulationLevel,glazingType:form.glazingType,hasCrossBreeze:form.hasCrossBreeze,
        wallColor:form.wallColor,roofColor:form.roofColor,roofType:form.roofType,
        occupancyLevel:form.occupancyLevel,unoccupiedBlocks:form.unoccupiedBlocks,heatSourceLevel:form.heatSourceLevel,
        windows:form.windows.map(w=>({size:w.size,direction:w.direction,glazingOverride:w.glazingOverride})),
        exteriorWalls:form.exteriorWalls,minTempF:form.minTempF,maxTempF:form.maxTempF,minHumidity:form.minHumidity,maxHumidity:form.maxHumidity,
      })});
      const data=await res.json();if(!res.ok)throw new Error(data.error??"Update failed.");
      router.push(`/dashboard/${encodeURIComponent(userEmail)}`);
    }catch(e){setError(e instanceof Error?e.message:"Update failed.");}
    finally{setLoading(false);}
  }

  if(fetching)return<div className="min-h-screen flex items-center justify-center" style={{background:"var(--cream)"}}><p className="font-display text-lg" style={{color:"var(--muted)"}}>Loading room…</p></div>;

  function renderStep(){
    switch(step){
      case 0:return(<div className="fade-up space-y-6">
        <div><Label>Room name</Label><input className="field" type="text" value={form.roomName} onChange={e=>set("roomName",e.target.value)}/></div>
        <div><Label hint="Ground floor = 1">Floor number</Label><div className="flex items-center gap-4"><button type="button" className="btn-ghost" style={{width:44,padding:"8px",textAlign:"center",fontSize:"1.2rem"}} onClick={()=>set("floorNumber",Math.max(1,form.floorNumber-1))}>−</button><span className="font-display text-3xl font-semibold" style={{color:"var(--navy)",minWidth:40,textAlign:"center"}}>{form.floorNumber}</span><button type="button" className="btn-ghost" style={{width:44,padding:"8px",textAlign:"center",fontSize:"1.2rem"}} onClick={()=>set("floorNumber",form.floorNumber+1)}>+</button></div></div>
        <div><Label>Top floor?</Label><div className="flex gap-3 mt-2">{[{v:true,label:"Yes — roof above"},{v:false,label:"No — floor above"}].map(({v,label})=><button key={label} type="button" className={`option-pill flex-1 ${form.isTopFloor===v?"selected":""}`} onClick={()=>set("isTopFloor",v)}>{label}</button>)}</div></div>
      </div>);
      case 1:return(<div className="fade-up space-y-5">
        {([["lengthFt","Length","15"],["widthFt","Width","12"],["ceilingHeightFt","Ceiling height","8"]] as const).map(([key,label,ph])=><div key={key}><Label>{label}</Label><div className="flex items-center gap-2"><input className="field" type="number" min="1" placeholder={ph} style={{maxWidth:140}} value={form[key]} onChange={e=>set(key,e.target.value)}/><span className="text-sm" style={{color:"var(--muted)"}}>ft</span></div></div>)}
        <div><Label>Orientation</Label><div className="flex gap-3 mt-2">{[{v:"NS" as Orientation,label:"North–South"},{v:"EW" as Orientation,label:"East–West"}].map(({v,label})=><button key={v} type="button" className={`option-pill flex-1 ${form.orientation===v?"selected":""}`} onClick={()=>set("orientation",v)}>{label}</button>)}</div></div>
      </div>);
      case 2:return(<div className="fade-up space-y-7">
        <div><Label>Wall insulation</Label><div className="space-y-2 mt-2">{INSULATION_OPTS.map(o=><RadioCard key={o.value} selected={form.insulationLevel===o.value} onClick={()=>set("insulationLevel",o.value)} label={o.label} desc={o.desc}/>)}</div></div>
        <div><Label>Window glazing</Label><div className="space-y-2 mt-2">{GLAZING_OPTS.map(o=><RadioCard key={o.value} selected={form.glazingType===o.value} onClick={()=>set("glazingType",o.value)} label={o.label} badge={o.u}/>)}</div></div>
        <div><Label hint="Lighter surfaces absorb less solar heat">Exterior wall color</Label><div className="flex gap-3 mt-2">{(["LIGHT","MEDIUM","DARK"] as SurfaceColor[]).map(v=><button key={v} type="button" className={`option-pill flex-1 ${form.wallColor===v?"selected":""}`} onClick={()=>set("wallColor",v)}>{v.charAt(0)+v.slice(1).toLowerCase()}</button>)}</div></div>
        <div><Label hint="Dark roofs absorb significantly more solar heat">Exterior roof color</Label><div className="flex gap-3 mt-2">{(["LIGHT","MEDIUM","DARK"] as SurfaceColor[]).map(v=><button key={v} type="button" className={`option-pill flex-1 ${form.roofColor===v?"selected":""}`} onClick={()=>set("roofColor",v)}>{v.charAt(0)+v.slice(1).toLowerCase()}</button>)}</div></div>
        <div><Label hint="Attic space buffers heat transfer from the roof">Roof type</Label><div className="space-y-2 mt-2">{([["ATTIC_BUFFERED","Attic (buffered)","Air gap above ceiling"],["FLAT_VAULTED","Flat or vaulted","Ceiling directly below roof"],["DIRECT_EXPOSED","Directly exposed","No insulating layer"]] as [RoofType,string,string][]).map(([v,l,d])=><RadioCard key={v} selected={form.roofType===v} onClick={()=>set("roofType",v)} label={l} desc={d}/>)}</div></div>
        <div><Label>Cross-breeze potential</Label><div className="flex gap-3 mt-2">{[{v:true,label:"Yes"},{v:false,label:"No"}].map(({v,label})=><button key={label} type="button" className={`option-pill flex-1 ${form.hasCrossBreeze===v?"selected":""}`} onClick={()=>set("hasCrossBreeze",v)}>{label}</button>)}</div></div>
      </div>);
      case 3:return(<div className="fade-up space-y-4">
        {form.windows.length>0&&<div className="space-y-2">{form.windows.map((w,i)=><div key={w.id} className="flex items-center justify-between p-3 rounded-xl" style={{background:"var(--sky-light)",border:"1px solid var(--sky)"}}><span className="text-sm font-medium" style={{color:"var(--navy)"}}>#{i+1} — {w.size.charAt(0)+w.size.slice(1).toLowerCase()}, faces {w.direction}</span><button type="button" className="text-xs" style={{color:"var(--error)"}} onClick={()=>set("windows",form.windows.filter(x=>x.id!==w.id))}>Remove</button></div>)}</div>}
        <div className="p-4 rounded-xl space-y-4" style={{background:"var(--cream)",border:"1.5px dashed var(--border)"}}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{color:"var(--muted)"}}>Add a window</p>
          <div><Label>Size</Label><div className="flex gap-2 flex-wrap">{WINDOW_SIZE_OPTS.map(o=><button key={o.value} type="button" className={`option-pill ${pendingWin.size===o.value?"selected":""}`} onClick={()=>setPendingWin(p=>({...p,size:o.value}))}><span className="block font-semibold">{o.label}</span><span className="block text-xs" style={{color:"var(--muted)"}}>{o.area}</span></button>)}</div></div>
          <div><Label>Direction</Label><CompassGrid selected={pendingWin.direction?[pendingWin.direction as Direction]:[]} onToggle={d=>setPendingWin(p=>({...p,direction:p.direction===d?"":d}))}/></div>
          <button type="button" className="btn-ghost" disabled={!pendingWin.size||!pendingWin.direction} onClick={addWindow} style={{opacity:(!pendingWin.size||!pendingWin.direction)?0.45:1}}>+ Add this window</button>
        </div>
      </div>);
      case 4:return(<div className="fade-up space-y-4">
        <CompassGrid selected={form.exteriorWalls} onToggle={toggleWall}/>
        {form.exteriorWalls.length>0&&<p className="text-sm" style={{color:"var(--muted)"}}>Selected: <strong style={{color:"var(--navy)"}}>{[...form.exteriorWalls].sort().join(", ")}</strong></p>}
      </div>);
      case 5:return(<div className="fade-up space-y-6">
        <div>
          <Label hint="Typical number of people when the room is in use">How many people use this room?</Label>
          <div className="flex gap-3 mt-2">
            {[{v:"ONE_TWO" as OccLevel,label:"1–2 people",desc:"Typical occupancy"},{v:"THREE_FOUR" as OccLevel,label:"3–4 people",desc:"Busier room"}].map(({v,label,desc})=>(
              <button key={v} type="button" className={`option-pill flex-1 text-left ${form.occupancyLevel===v?"selected":""}`} style={{padding:"12px 14px"}} onClick={()=>set("occupancyLevel",v)}>
                <span className="block font-semibold">{label}</span>
                <span className="block text-xs mt-0.5" style={{color:"var(--muted)",fontWeight:400}}>{desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label hint="Add time windows when the room is empty — it's assumed occupied by default">When is the room unoccupied?</Label>
          <p className="text-xs mb-3" style={{color:"var(--muted)"}}>Add as many blocks as you need.</p>
          <UnoccupiedBlocksBuilder blocks={form.unoccupiedBlocks} onChange={b=>set("unoccupiedBlocks",b)}/>
        </div>
        {form.unoccupiedBlocks.length>0&&<div className="p-4 rounded-xl" style={{background:"var(--white)",border:"1px solid var(--border)"}}><OccupancyTimeline blocks={form.unoccupiedBlocks}/></div>}
      </div>);
      case 6:return(<div className="fade-up space-y-3">
        <p className="text-sm mb-2" style={{color:"var(--muted)"}}>Heat-generating devices that run regularly in this room.</p>
        {HEAT_OPTS.map(o=><RadioCard key={o.value} selected={form.heatSourceLevel===o.value} onClick={()=>set("heatSourceLevel",o.value)} label={o.label} desc={o.desc} badge={`${o.rate} BTU/hr·ft²`}/>)}
      </div>);
      case 7:return(<div className="fade-up space-y-8">
        <div><Label>Temperature range</Label><div className="p-5 rounded-xl space-y-5" style={{background:"var(--sky-light)"}}>
          {([["minTempF","Minimum",55,80,(v:number)=>v<form.maxTempF],["maxTempF","Maximum",60,88,(v:number)=>v>form.minTempF]] as const).map(([key,label,min,max,guard])=>(
            <div key={key}><div className="flex justify-between items-baseline mb-2"><span className="text-sm font-medium" style={{color:"var(--muted)"}}>{label}</span><span className="font-display text-2xl font-semibold" style={{color:"var(--navy)"}}>{form[key]}°F</span></div><input type="range" className="range-slider" min={min} max={max} step={1} value={form[key]} onChange={e=>{const v=+e.target.value;if(guard(v))set(key,v);}}/></div>
          ))}<div className="text-center"><span className="text-xs px-3 py-1 rounded-full font-medium" style={{background:"var(--sky)",color:"white"}}>{form.minTempF}°–{form.maxTempF}°F</span></div>
        </div></div>
        <div><Label>Humidity range</Label><div className="p-5 rounded-xl space-y-5" style={{background:"var(--sage-light)"}}>
          {([["minHumidity","Minimum",20,60,(v:number)=>v<form.maxHumidity],["maxHumidity","Maximum",30,80,(v:number)=>v>form.minHumidity]] as const).map(([key,label,min,max,guard])=>(
            <div key={key}><div className="flex justify-between items-baseline mb-2"><span className="text-sm font-medium" style={{color:"var(--muted)"}}>{label}</span><span className="font-display text-2xl font-semibold" style={{color:"var(--navy)"}}>{form[key]}%</span></div><input type="range" className="range-slider" min={min} max={max} step={1} value={form[key]} onChange={e=>{const v=+e.target.value;if(guard(v))set(key,v);}}/></div>
          ))}<div className="text-center"><span className="text-xs px-3 py-1 rounded-full font-medium" style={{background:"var(--sage)",color:"white"}}>{form.minHumidity}%–{form.maxHumidity}%</span></div>
        </div></div>
      </div>);
      case 8:return(<div className="fade-up space-y-3">
        {[
          {heading:"Room",items:[{label:"Name",value:form.roomName},{label:"Floor",value:`Floor ${form.floorNumber}${form.isTopFloor?" (top)":""}`}]},
          {heading:"Occupancy",items:[{label:"Headcount",value:form.occupancyLevel==="THREE_FOUR"?"3–4 people":"1–2 people"},{label:"Unoccupied blocks",value:form.unoccupiedBlocks.length>0?`${form.unoccupiedBlocks.length} defined`:"None"},{label:"Heat sources",value:HEAT_OPTS.find(o=>o.value===form.heatSourceLevel)?.label??""}]},
          {heading:"Comfort",items:[{label:"Temperature",value:`${form.minTempF}°–${form.maxTempF}°F`},{label:"Humidity",value:`${form.minHumidity}%–${form.maxHumidity}%`}]},
        ].map(s=>(
          <div key={s.heading} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:"var(--sky)"}}>{s.heading}</p>
            <div className="space-y-1.5">{s.items.map(item=><div key={item.label} className="flex justify-between text-sm gap-4"><span style={{color:"var(--muted)"}}>{item.label}</span><span className="font-medium text-right" style={{color:"var(--navy)"}}>{item.value}</span></div>)}</div>
          </div>
        ))}
      </div>);
      default:return null;
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--cream)"}}>
      <header className="px-6 py-5 flex items-center justify-between" style={{borderBottom:"1px solid var(--border)",background:"var(--white)"}}>
        <div className="flex items-center gap-2"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="var(--sky)" strokeWidth="1.8"/><line x1="2" y1="9" x2="22" y2="9" stroke="var(--sky)" strokeWidth="1.5"/><line x1="12" y1="4" x2="12" y2="20" stroke="var(--sky)" strokeWidth="1.5"/></svg><span className="font-display text-lg font-semibold" style={{color:"var(--navy)"}}>Window Advisor</span></div>
        <span className="text-xs" style={{color:"var(--muted)"}}>Edit room</span>
      </header>
      <div className="px-6 py-3" style={{borderBottom:"1px solid var(--border)",background:"var(--white)"}}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-1 mb-1">{STEPS.map((s,i)=><div key={s} className="flex-1 h-1 rounded-full transition-all duration-300" style={{background:i<step?"var(--sage)":i===step?"var(--sky)":"var(--border)"}}/>)}</div>
          <div className="flex justify-between text-xs" style={{color:"var(--muted)"}}><span>{STEPS[step]}</span><span>{step+1} / {STEPS.length}</span></div>
        </div>
      </div>
      <main className="flex-1 px-6 py-10">
        <div className="max-w-lg mx-auto">
          <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{color:"var(--sky)"}}>Step {step+1} of {STEPS.length}</p><h2 className="font-display text-3xl font-semibold" style={{color:"var(--navy)"}}>{STEPS[step]}</h2></div>
          {renderStep()}
          {error&&<div className="mt-5 px-4 py-3 rounded-xl text-sm" style={{background:"var(--error-light)",color:"var(--error)"}}>{error}</div>}
          <div className="mt-8 flex items-center justify-between">
            <button type="button" className="btn-secondary" onClick={back} disabled={step===0}>← Back</button>
            {step<STEPS.length-1?<button type="button" className="btn-primary" onClick={next}>Continue →</button>:<button type="button" className="btn-primary" onClick={submit} disabled={loading}>{loading?"Saving…":"Save changes →"}</button>}
          </div>
        </div>
      </main>
    </div>
  );
}
