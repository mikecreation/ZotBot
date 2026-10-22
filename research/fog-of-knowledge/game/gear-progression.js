// Manufacturing steps are gameplay abstractions, with explicit materials and stations.
export const GEAR_ITEMS={
 bark:{name:'Tannin-rich bark',mass:.3,density:500,r:.06,color:0x715132},
 thread:{name:'Twisted plant-fiber thread',mass:.05,density:500,r:.05,color:0xb8a474},
 leather:{name:'Tanned leather',mass:1,density:950,r:.1,color:0x98613a},
 hammer_stone:{name:'Hafted stone hammer',mass:1.2,density:2200,r:.09,color:0x777777,tool:'hammer',dur:100},
 tongs:{name:'Bronze forging tongs',mass:.7,density:6000,r:.08,color:0xb68248,tool:true},
 needle_iron:{name:'Iron sewing needle',mass:.01,density:7870,r:.025,color:0x9da1a5,tool:true},
 iron_spike:{name:'Forged iron grip spike',mass:.04,density:7870,r:.03,color:0x8d9298},
 leather_gloves:{name:'Stitched leather gloves',mass:.3,density:950,r:.09,color:0x885b39},
 climbing_gloves:{name:'Spiked climbing gloves',mass:.7,density:1800,r:.1,color:0x885b39},
 knife_copper:{name:'Copper knife',mass:.25,density:4500,r:.06,color:0xd98a4a,tool:'knife',dur:90},
 knife_bronze:{name:'Bronze knife',mass:.25,density:4500,r:.06,color:0xc5913c,tool:'knife',dur:180},
 knife_iron:{name:'Iron knife',mass:.3,density:4500,r:.06,color:0x8d9298,tool:'knife',dur:320},
};
export const GEAR_RECIPES=[
 {out:'bark',in:{log:1},n:4,ret:'stick',knife:true},
 {out:'thread',in:{fiber:3},n:3},
 {out:'leather',in:{hide:1,bark:3,pot_water:1},ret:'pot',knife:true},
 {out:'hammer_stone',in:{stone:1,stick:1,fiber:2},knife:true},
 {out:'pot',in:{clay:2},heat:600,station:'fire'},
 {out:'copper',in:{copper_ore:1,charcoal:2},heat:1085,station:'kiln',unlock:'smelting'},
 {out:'tin',in:{tin_ore:1,charcoal:2},heat:1000,station:'kiln'},
 {out:'bronze',in:{copper:2,tin:1},heat:1085,station:'kiln',unlock:'bronze',n:3},
 {out:'iron',in:{iron_ore:2,charcoal:4},heat:1200,station:'kiln',bellows:true,tool:'hammer_stone',unlock:'iron'},
 {out:'tongs',in:{bronze:1,clay:1},heat:1085,station:'kiln'},
 {out:'needle_iron',in:{iron:1},heat:850,station:'fire',tools:['hammer_stone','tongs'],n:4},
 {out:'iron_spike',in:{iron:1},heat:850,station:'fire',tools:['hammer_stone','tongs'],n:6},
 {out:'leather_gloves',in:{leather:2,thread:2},tools:['needle_iron'],knife:true},
 {out:'climbing_gloves',in:{leather_gloves:1,iron_spike:6,thread:2,leather:1},tools:['needle_iron'],knife:true},
 {out:'knife_copper',in:{copper:1,stick:1,thread:1},heat:800,station:'fire',tool:'hammer_stone'},
 {out:'knife_bronze',in:{bronze:1,stick:1,thread:1},heat:800,station:'fire',tool:'hammer_stone'},
 {out:'knife_iron',in:{iron:1,stick:1,thread:1},heat:850,station:'fire',tools:['hammer_stone','tongs']},
];
export const GEAR_STEPS={
 bark:['Strip bark with the knife','Keep a wooden handle from the stripped log'],
 thread:['Gather flower stems / plant fiber with E','Separate strands, twist and counter-twist into thread'],
 leather:['Scrape and clean the animal hide','Soak with tannin-rich bark and water','Work and soften the leather; long tanning time is compressed in this game'],
 hammer_stone:['Shape a wooden handle','Seat a hard stone head','Bind it tightly with plant fiber'],
 copper:['Ore + charcoal in a hot kiln','Reduce the ore and collect metal; furnace chemistry is simplified'],
 tin:['Ore + charcoal in a hot kiln','Reduce ore and collect tin'],
 bronze:['Heat copper and tin','Alloy them; these game item counts are not a literal metallurgical ratio'],
 iron:['Ore + charcoal + forced air in kiln','Reduce ore to a solid bloom','Hammer out slag; this is not melting iron'],
 tongs:['Prepare paired clay molds','Cast bronze arms and join the pivot'],
 needle_iron:['Hold hot iron with tongs','Hammer and draw a fine shaft','Pierce the eye and finish the point'],
 iron_spike:['Grip hot iron with tongs','Hammer a tapered point and broad mounting base'],
 leather_gloves:['Cut paired palm and finger panels','Stitch with needle and thread','Close seams and fit the cuffs'],
 climbing_gloves:['Place six spikes through reinforced leather palms','Stitch backing patches and secure the bases','Fit cuffs; gloves automatically equip from inventory'],
 knife_copper:['Shape copper blade','Fit handle and bind'],knife_bronze:['Shape bronze blade','Fit handle and bind'],knife_iron:['Forge iron blade','Finish edge, fit handle and bind'],
};
export function gearProblem(r,inv,structures,pos){
 if(r.knife&&!['knife_stone','knife_copper','knife_bronze','knife_iron'].some(k=>inv(k)))return 'Needs a knife';
 for(const k of r.tools||[])if(!inv(k))return 'Missing tool: '+k.replaceAll('_',' ');
 if(r.station){const s=structures.find(s=>(r.station==='fire'?['fire','kiln'].includes(s.type):s.type===r.station)&&s.lit&&Math.hypot(s.x-pos.x,s.z-pos.z)<4&&(s.temp||0)>=r.heat&&(!r.bellows||s.bellows));if(!s)return `Needs nearby lit ${r.station}, ${r.heat} °C / ${(r.heat*1.8+32).toFixed(0)} °F${r.bellows?' with bellows':''}`}
 return '';
}
export const CLIMB_GUIDE=`<h2>DID YOU KNOW? You can climb steep slopes.</h2><p>Craft <b>spiked climbing gloves</b> in the Backpack. Wear them automatically by keeping them in your inventory, then walk uphill with WASD: your hands reach into the slope and the gloves prevent the usual slope slide while attached.</p><ol><li>E: gather wildflower stems for fiber; twist them into thread.</li><li>Hunt for hides. Strip bark from logs with a knife; use bark and water to prepare leather.</li><li>Make a stone hammer, clay kiln and hide bellows. Mine copper, tin and iron ore using a pickaxe.</li><li>Use charcoal and heat: copper + tin → bronze tongs; iron ore → iron bloom.</li><li>Forge a sewing needle and six grip spikes. Sew leather gloves, then reinforce their palms and mount the spikes.</li></ol><p>Every recipe and missing component is listed in the Backpack. Higher metal knife and axe tiers have greater game durability.</p><small>Climbing grip, crafting times and material processing are simplified game rules. Spiked gloves do not make real steep rock safe to climb.</small>`;
