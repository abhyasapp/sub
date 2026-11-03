// js/admin/subj-smart.js — Smart Paste parser. Used only by admin.html.
// Splitting it out of subjective.js saves ~4 KB on every student session.

const SORT_RULES = {
  structure: { group: 'A', keywords: [
    'beam','slab','column','footing','rcc','reinforced','concrete','bending',
    'shear','deflection','bond','anchorage','prestress','prestressed','working stress',
    'limit state','doubly reinforced','staircase','two-way slab','cantilever',
    't-beam','box culvert','bridges','bridge','suspension','deck girder',
    'earthquake','seismic','ductility','masonry','rule of thumb','stiffness matrix',
    'flexibility matrix','influence line','moment capacity','fe415','m20','m15'
  ]},
  geotech: { group: 'A', keywords: [
    'soil','compaction','consolidation','void ratio','permeability','effective stress',
    'capillary','quick sand','seepage','flow net','shear strength','mohr','coulomb',
    'slope failure','factor of safety','bio-engineering','bioengineering','retaining wall',
    'earth pressure','rankine','coloumb','bearing capacity','terzaghi','settlement',
    'pile','caisson','well foundation','mat foundation','raft',
    'spt','standard penetration','plate load','site investigation','boring','soil sample',
    'foundation','underpinning','grouting'
  ]},
  irrigationAndCo: { group: 'B', keywords: [
    'rainfall','hydrograph','unit hydrograph','flood','flood frequency','gumbel',
    'runoff','run-off','watershed','catchment','discharge','rating curve','sediment',
    'glof','reservoir','dam height','trap efficiency','infiltration',
    'irrigation','canal','weir','barrage','headworks','headwork','duty','delta',
    'kennedy','lacey','regime','silt factor','cross drainage','aqueduct','syphon',
    'hydraulic jump','froude','bernoulli','manning','chezy','pipe flow','open channel',
    'water hammer','surge tank','penstock','turbine','hydropower','de-sanding',
    'spillway','gravity dam','embankment dam','canal lining','waterlogging',
    'drainage coefficient','recharge','aquifer','well hydraulics'
  ]},
  transportAndCo: { group: 'C', keywords: [
    'highway','road','pavement','flexible pavement','rigid pavement','cbr','subgrade',
    'bitumen','asphalt','aggregate','marshal','penetration test','ductility test',
    'viscosity','highway alignment','geometric design','superelevation','transition curve',
    'sight distance','stopping sight','hair pin','hill road',
    'traffic','traffic volume','o-d survey','origin destination','parking survey',
    'accident','intersection','rotary','traffic signal','road marking','road lighting',
    'airport','runway','taxiway','apron','aerodrome','icao','stol','heliport',
    'maintenance','overlay','pothole','crack','pci','pavement distress','esal','eal'
  ]},
  publicHealth: { group: 'D', keywords: [
    'water supply','potable','water demand','per capita demand','intake','reservoir tank',
    'distribution system','water treatment','sedimentation','coagulation','flocculation',
    'filtration','slow sand','rapid sand','disinfection','chlorination','break point',
    'hardness','alkalinity','iron removal','manganese','who standard','water quality',
    'bod','cod','bod5','sewage','sewer','sewerage','self cleansing','non scouring',
    'septic tank','soak pit','activated sludge','trickling filter','oxidation pond',
    'sludge','effluent','wastewater','sanitation','ecological sanitation','excreta',
    'water borne disease','typhoid','cholera','solid waste','landfill','composting',
    'incineration','iee','eia','environmental impact','pollution','air pollution',
    'greenhouse','carbon','recycle','reuse'
  ]},
  miscellaneous: { group: 'D', keywords: [
    'project management','cpm','pert','critical path','bar chart','gantt',
    'quantity surveying','rate analysis','estimate','bill of quantities','boq',
    'tender','contract','specification','quality assurance','qa plan',
    'professional ethics','code of conduct','loksewa','public procurement',
    'hydropower policy','nea','electricity act','renewable','solar','wind','biogas',
    'load factor','capacity factor','utilization factor','roi','irr','roe'
  ]}
};

function _classifyQuestion(text){
  const t = ' ' + String(text).toLowerCase().replace(/\s+/g, ' ') + ' ';
  let best = { chapterId: null, groupKey: null, score: 0 };
  for(const [chId, rule] of Object.entries(SORT_RULES)){
    let score = 0;
    for(const kw of rule.keywords){
      const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|\\W)${safe}(\\W|$)`, 'gi');
      const m = t.match(re);
      /* Longer keywords are far more specific: "flexible pavement" should
         beat "road", and "water treatment" should beat "water". Doubling
         their weight stops short generic words from deciding the chapter. */
      if(m) score += (kw.length >= 8 ? m.length * 2 : m.length);
    }
    if(score > best.score) best = { chapterId: chId, groupKey: rule.group, score };
  }
  return best.score > 0 ? best : null;
}

function _splitRawTextIntoQuestions(raw){
  if(!raw) return [];
  const cleaned = String(raw)
    .replace(/\r/g, '')
    .replace(/^\s*=====.*=====\s*$/gim, '')
    .replace(/^\s*Page \d+.*$/gim, '')
    .replace(/\n{2,}/g, '\n');
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
  const out = [];
  let buf = '';
  const flush = () => { const t = buf.trim(); if(t.length >= 15) out.push(t); buf = ''; };
  for(const line of lines){
    const isStart = /^(\d+[.)]|Q\d*[.)]|[-•*])\s+\S/.test(line);
    if(isStart){ flush(); buf = line; }
    else if(/^(Section|Chapter|Group|Marks|Note|Section[- ]?[A-Z])\b/i.test(line)){ flush(); }
    else if(buf){ buf += ' ' + line; }
    else { buf = line; }
  }
  flush();
  return out;
}

function _extractMarks(text){
  const m1 = text.match(/\[([\d.+ ]+)\]/);
  const m2 = text.match(/\(([\d.+ ]+)\)\s*marks?/i);
  const m3 = text.match(/(\d+)\s*marks?/i);
  const raw = (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]);
  if(!raw) return 10;
  if(raw.includes('+')){
    return Math.round(raw.split('+').reduce((a,b) => a + (parseFloat(b) || 0), 0));
  }
  const n = parseInt(raw, 10);
  return (n >= 1 && n <= 40) ? n : 10;
}

window.SUBJ_SMART = {
  preview(rawText){
    const chunks = _splitRawTextIntoQuestions(rawText);
    return chunks.map((text, idx) => {
      const marks = _extractMarks(text);
      const cleaned = text
        .replace(/\[[^\]]+\]/g, '')
        .replace(/\([^)]+\)\s*marks?/gi, '')
        .replace(/\d+\s*marks?/gi, '')
        .replace(/^\d+[.)]\s*/, '')
        .replace(/^Q\d*[.)]\s*/i, '')
        .replace(/^[-•*]\s*/, '')
        .trim();
      const guess = _classifyQuestion(cleaned);
      return {
        idx,
        question: cleaned,
        marks,
        suggestedChapter: guess ? guess.chapterId : null,
        suggestedGroup:   guess ? guess.groupKey  : null,
        confidence:       guess ? guess.score     : 0
      };
    });
  },
  classify: _classifyQuestion,
  split:    _splitRawTextIntoQuestions,
  extractMarks: _extractMarks
};