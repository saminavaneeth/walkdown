/* Walkdown: site, mock systems and demo scenarios. Everything here is fictional. */
"use strict";

const SITE = {
  name: "Plant 2 · Stamping and Assembly",
  locations: ["Press Line 1","Press Line 2","Press Line 3","Press Line 4","Warehouse","Shipping Dock","Packing","Wash Station","MCC Room","Maintenance Shop","Tank Farm","Roof - Building B","Office / Admin"]
};

const COURSES = ["Forklift pedestrian safety refresher","Lockout/tagout refresher","HazCom labelling","Working at heights","Confined space entry","Machine guarding awareness"];
const ALERT_ROLES = ["EHS manager","Plant manager","Contractor coordinator","Maintenance supervisor","Area supervisor"];

/* Field kinds: text, enum, location, person, number, link (filled from another step when it is sent). */
const SYSTEMS = [
  {id:"ehs", name:"EHS platform", code:"EHS", about:"Concerns, incidents, findings, observations, actions and meetings.", objects:{
    concern:{label:"Safety concern", verb:"Create", prefix:"CON", fields:[
      {key:"concern_type", label:"Concern type", kind:"enum", options:["Near miss","Unsafe condition","Unsafe act","Environmental concern"], required:true},
      {key:"location", label:"Location", kind:"location", required:true},
      {key:"description", label:"What was seen", kind:"text", required:true},
      {key:"immediate_action", label:"Immediate action", kind:"text"},
      {key:"potential_severity", label:"Potential severity", kind:"enum", options:["Low","Medium","High","Potentially serious (SIF)"], policy:"person_decides"}]},
    incident:{label:"Incident", verb:"Create", prefix:"INC", fields:[
      {key:"incident_type", label:"Incident type", kind:"enum", options:["Injury or illness","Property damage","Environmental release","Vehicle"], required:true},
      {key:"date_time", label:"Date and time", kind:"text", required:true},
      {key:"location", label:"Location", kind:"location", required:true},
      {key:"description", label:"What happened", kind:"text", required:true},
      {key:"immediate_actions", label:"Immediate actions", kind:"text"},
      {key:"injured_person", label:"Injured person", kind:"person", policy:"restricted"},
      {key:"injury_details", label:"Injury and body part", kind:"text", policy:"restricted"},
      {key:"treatment", label:"Treatment given", kind:"text", policy:"restricted"},
      {key:"recordability", label:"Recordability", kind:"enum", options:["First aid only","Recordable","Lost time"], policy:"person_decides"},
      {key:"regulator_report", label:"Report to regulator", kind:"enum", options:["Not required","Required"], policy:"person_decides"}]},
    finding:{label:"Inspection finding", verb:"Create", prefix:"FND", fields:[
      {key:"location", label:"Location", kind:"location", required:true},
      {key:"equipment", label:"Equipment or item", kind:"text"},
      {key:"finding", label:"Finding", kind:"text", required:true},
      {key:"status", label:"Status", kind:"enum", options:["Open","Corrected on the spot"], required:true}]},
    observation:{label:"Behavior observation", verb:"Create", prefix:"OBS", noNames:true, fields:[
      {key:"observation", label:"Observation", kind:"enum", options:["Safe","At-risk"], required:true},
      {key:"category", label:"Category", kind:"enum", options:["PPE","Body position","Line of fire","Vehicles and mobile equipment","Tools and equipment","Housekeeping","Procedure or permit"], required:true},
      {key:"location", label:"Location", kind:"location", required:true},
      {key:"description", label:"What was observed", kind:"text", required:true},
      {key:"feedback_given", label:"Feedback given", kind:"enum", options:["Yes","No"]}]},
    action:{label:"Corrective action", verb:"Create", prefix:"ACT", fields:[
      {key:"description", label:"Action", kind:"text", required:true},
      {key:"owner", label:"Owner", kind:"person", required:true},
      {key:"due", label:"Due", kind:"text", required:true},
      {key:"priority", label:"Priority", kind:"enum", options:["Low","Medium","High"], policy:"person_decides"},
      {key:"work_order", label:"Work order", kind:"link"},
      {key:"related_record", label:"Related record", kind:"link"}]},
    meeting:{label:"Safety meeting", verb:"Create", prefix:"MTG", fields:[
      {key:"meeting_type", label:"Meeting type", kind:"enum", options:["Toolbox talk","JHSC meeting","Safety meeting"], required:true},
      {key:"status", label:"Status", kind:"enum", options:["Held","Scheduled"], required:true},
      {key:"topic", label:"Topic", kind:"text", required:true},
      {key:"group", label:"Crew or group", kind:"text"},
      {key:"date", label:"Date", kind:"text"},
      {key:"attendee_count", label:"Attendees", kind:"number"},
      {key:"attendees", label:"Attendance list", kind:"text"}]},
    contractor_obs:{label:"Contractor observation", verb:"Create", prefix:"CTR", fields:[
      {key:"contractor", label:"Contractor", kind:"text", required:true},
      {key:"location", label:"Location", kind:"location", required:true},
      {key:"work_activity", label:"Work activity", kind:"text"},
      {key:"finding", label:"Finding", kind:"text", required:true},
      {key:"stop_work", label:"Work stopped", kind:"enum", options:["Yes","No"]},
      {key:"outcome", label:"Outcome", kind:"text"},
      {key:"permit_ref", label:"Permit", kind:"link"}]}
  }},
  {id:"cmms", name:"Maintenance (CMMS)", code:"CMMS", about:"Work orders for the maintenance team.", objects:{
    work_order:{label:"Work order", verb:"Create", prefix:"WO", fields:[
      {key:"asset", label:"Asset", kind:"text", required:true},
      {key:"location", label:"Location", kind:"location", required:true},
      {key:"problem", label:"Problem", kind:"text", required:true},
      {key:"work_type", label:"Work type", kind:"enum", options:["Safety","Corrective","Inspection"], required:true},
      {key:"assigned_to", label:"Assigned to", kind:"person"},
      {key:"due", label:"Due", kind:"text"},
      {key:"priority", label:"Priority", kind:"enum", options:["Emergency","High","Medium","Low"], policy:"person_decides"}]}
  }},
  {id:"ptw", name:"Permit to work", code:"PTW", about:"Active permits and contractor work authorizations.", objects:{
    permit_check:{label:"Permit check", verb:"Check", action:"check", fields:[
      {key:"contractor", label:"Contractor", kind:"text", required:true},
      {key:"location", label:"Location", kind:"location"},
      {key:"permit_number", label:"Permit number", kind:"text"}]}
  }},
  {id:"lms", name:"Training (LMS)", code:"LMS", about:"Course assignments for crews and roles.", objects:{
    assignment:{label:"Training assignment", verb:"Assign", prefix:"ASG", noNames:true, fields:[
      {key:"course", label:"Course", kind:"enum", options:COURSES, required:true},
      {key:"audience", label:"Crew or role", kind:"text", required:true},
      {key:"due", label:"Due", kind:"text"},
      {key:"reason", label:"Reason", kind:"text"},
      {key:"related_record", label:"Related record", kind:"link"}]}
  }},
  {id:"alerts", name:"Alerts", code:"ALR", about:"Messages to people who need to act.", objects:{
    message:{label:"Alert", verb:"Send", prefix:"ALT", fields:[
      {key:"to", label:"To", kind:"enum", options:ALERT_ROLES, required:true},
      {key:"urgency", label:"Urgency", kind:"enum", options:["Immediate","Today","FYI"], required:true},
      {key:"message", label:"Message", kind:"text", required:true},
      {key:"related_record", label:"Related record", kind:"link"}]}
  }}
];

/* Records that already exist in the mock permit system. */
const PERMITS = [
  {id:"PTW-2291", contractor:"XYZ Electrical", location:"MCC Room", work:"Panel upgrade on MCC-1", valid:"Oct 13 to Oct 15", conditions:["Personal lock and tag on every isolation point","Isolation point: main disconnect MCC-1"]},
  {id:"PTW-2304", contractor:"Northline Roofing", location:"Roof - Building B", work:"Roof membrane repair", valid:"Oct 12 to Oct 16", conditions:["Guardrail at all open edges, or tie-off where a guardrail is not possible"]},
  {id:"PTW-2310", contractor:"Atlas Rigging", location:"Press Line 4", work:"Die change lift", valid:"Oct 14", conditions:["Exclusion zone under the suspended load"]}
];

/* Demo scenarios. "recorded" is an AI plan written in advance for the demo; the checks, plan and mock systems all run live in the page. */
const SCENARIOS = [
  {id:"walk", title:"B-shift floor walk", blurb:"One walk, five systems: a loose guard, a near miss, a contractor lock and a toolbox talk.",
   voice:{duration:"0:52"},
   text:"Tuesday, B-shift walk. Did the toolbox talk with B-shift press line, fourteen people, topic was pinch points at the feed tables. On line 3 the guard on press 7 is missing a bolt on the right side panel. Told Mike in maintenance, he'll fix it by end of shift. In the warehouse a forklift backed out of aisle 6 without the horn and a pedestrian had to step back, maybe a metre away. Nobody hurt. I want the warehouse drivers to get the pedestrian safety refresher this week. XYZ Electrical is in the MCC room, permit's posted but their lock on the main disconnect isn't tagged. Let the contractor coordinator know today.",
   media:[
     {id:"m1", kind:"photo", label:"Photo 1", caption:"Press 7 guard"},
     {id:"m2", kind:"video", label:"Video 1", caption:"Aisle 6, 10 seconds", frames:5},
     {id:"m3", kind:"document", label:"Document 1", caption:"Permit posted at the MCC room"},
     {id:"m4", kind:"photo", label:"Photo 2", caption:"MCC-1 main disconnect"}
   ],
   recorded:{
     media_notes:[
       {media:"m1", text:"PRESS 7 stencilled on the frame. Seen: right side guard panel with an empty bolt hole at the top corner; the panel is still in place."},
       {media:"m2", text:"AISLE 6 sign on the racking. Seen: a forklift reverses out of the aisle while a person in a hi-vis vest steps back at the aisle end. The frames cannot confirm whether the horn sounded."},
       {media:"m3", text:"PERMIT TO WORK PTW-2291. Contractor: XYZ Electrical. Work: panel upgrade, MCC-1. Isolation point: main disconnect MCC-1. Valid Oct 13 to Oct 15."},
       {media:"m4", text:"Seen: a red personal lock on the main disconnect handle with no tag attached."}
     ],
     events:[
       {id:"e1", summary:"Toolbox talk with B-shift press line"},
       {id:"e2", summary:"Missing bolt on the press 7 guard, fix promised by end of shift"},
       {id:"e3", summary:"Forklift reversed out of aisle 6 close to a pedestrian"},
       {id:"e4", summary:"Contractor lock on the MCC-1 main disconnect has no tag"}
     ],
     steps:[
       {id:"s1", event:"e1", system:"ehs", object:"meeting", title:"Toolbox talk: pinch points at the feed tables", fields:{
         meeting_type:{value:"Toolbox talk", evidence:"Did the toolbox talk with B-shift press line"},
         status:{value:"Held", evidence:"Did the toolbox talk"},
         topic:{value:"Pinch points at the feed tables", evidence:"topic was pinch points at the feed tables"},
         group:{value:"B-shift press line", evidence:"toolbox talk with B-shift press line"},
         date:{value:"Tuesday", evidence:"Tuesday, B-shift walk"},
         attendee_count:{value:14, evidence:"fourteen people"},
         attendees:{value:null, evidence:""}},
        questions:["Can you add the sign-in sheet so attendance is recorded by name?"], flags:[], links:[]},
       {id:"s2", event:"e2", system:"ehs", object:"finding", title:"Press 7 guard missing a bolt on the right side panel", fields:{
         location:{value:"Press Line 3", evidence:"On line 3"},
         equipment:{value:"Press 7, right side guard panel", evidence:"the guard on press 7 is missing a bolt on the right side panel"},
         finding:{value:"The right side guard panel on press 7 is missing a bolt. The panel is still in place.", evidence:"the panel is still in place"},
         status:{value:"Open", evidence:"he'll fix it by end of shift"}},
        questions:["Did press 7 keep running until the bolt was replaced?"], flags:[], links:[]},
       {id:"s3", event:"e2", system:"cmms", object:"work_order", title:"Replace missing bolt on the press 7 guard", fields:{
         asset:{value:"Press 7", evidence:"the guard on press 7 is missing a bolt"},
         location:{value:"Press Line 3", evidence:"On line 3"},
         problem:{value:"The right side guard panel is missing a bolt. Replace the bolt.", evidence:"missing a bolt on the right side panel"},
         work_type:{value:"Safety", evidence:"the guard on press 7 is missing a bolt"},
         assigned_to:{value:"Mike (maintenance)", evidence:"Told Mike in maintenance"},
         due:{value:"End of shift", evidence:"he'll fix it by end of shift"},
         priority:{value:null, evidence:""}},
        questions:[], flags:[], links:[]},
       {id:"s4", event:"e2", system:"ehs", object:"action", title:"Fix the press 7 guard bolt", fields:{
         description:{value:"Replace the missing bolt on the press 7 right side guard panel.", evidence:"the guard on press 7 is missing a bolt on the right side panel"},
         owner:{value:"Mike (maintenance)", evidence:"Told Mike in maintenance"},
         due:{value:"End of shift", evidence:"he'll fix it by end of shift"},
         priority:{value:null, evidence:""}},
        questions:["Who will check the guard after the fix?"], flags:[], links:[{field:"work_order", from:"s3"},{field:"related_record", from:"s2"}]},
       {id:"s5", event:"e3", system:"ehs", object:"concern", title:"Forklift reversed out of aisle 6 without the horn", fields:{
         concern_type:{value:"Near miss", evidence:"a pedestrian had to step back, maybe a metre away"},
         location:{value:"Warehouse", evidence:"In the warehouse"},
         description:{value:"A forklift reversed out of aisle 6 without sounding the horn. A pedestrian stepped back at about one metre. No injury.", evidence:"a forklift backed out of aisle 6 without the horn and a pedestrian had to step back, maybe a metre away"},
         immediate_action:{value:null, evidence:""},
         potential_severity:{value:null, evidence:""}},
        questions:["Was anything done at the time, such as stopping the truck or talking with the driver?"],
        flags:[{kind:"sif_precursor", note:"A pedestrian was within about a metre of a moving forklift.", evidence:"a pedestrian had to step back, maybe a metre away"},{kind:"decision_needed", note:"A person should rate the potential severity.", evidence:""}], links:[]},
       {id:"s6", event:"e3", system:"lms", object:"assignment", title:"Pedestrian safety refresher for warehouse drivers", fields:{
         course:{value:"Forklift pedestrian safety refresher", evidence:"the pedestrian safety refresher"},
         audience:{value:"Warehouse drivers", evidence:"the warehouse drivers"},
         due:{value:"This week", evidence:"this week"},
         reason:{value:"Near miss: a forklift reversed out of aisle 6 close to a pedestrian.", evidence:"a pedestrian had to step back"}},
        questions:[], flags:[], links:[{field:"related_record", from:"s5"}]},
       {id:"s7", event:"e4", system:"ptw", object:"permit_check", title:"Check the XYZ Electrical permit", fields:{
         contractor:{value:"XYZ Electrical", evidence:"XYZ Electrical is in the MCC room"},
         location:{value:"MCC Room", evidence:"in the MCC room"},
         permit_number:{value:"PTW-2291", evidence:"PERMIT TO WORK PTW-2291"}},
        questions:[], flags:[], links:[]},
       {id:"s8", event:"e4", system:"ehs", object:"contractor_obs", title:"Contractor lock on the MCC-1 main disconnect has no tag", fields:{
         contractor:{value:"XYZ Electrical", evidence:"XYZ Electrical is in the MCC room"},
         location:{value:"MCC Room", evidence:"in the MCC room"},
         work_activity:{value:"Panel upgrade on MCC-1", evidence:"Work: panel upgrade, MCC-1"},
         finding:{value:"The contractor's personal lock on the main disconnect has no tag.", evidence:"their lock on the main disconnect isn't tagged"},
         stop_work:{value:null, evidence:""}},
        questions:["Was the work paused until the lock was tagged?"],
        flags:[{kind:"sif_precursor", note:"Hazardous energy control: an untagged lock weakens isolation checks.", evidence:"their lock on the main disconnect isn't tagged"}], links:[{field:"permit_ref", from:"s7"}]},
       {id:"s9", event:"e4", system:"alerts", object:"message", title:"Tell the contractor coordinator about the untagged lock", fields:{
         to:{value:"Contractor coordinator", evidence:"Let the contractor coordinator know today"},
         urgency:{value:"Today", evidence:"know today"},
         message:{value:"XYZ Electrical's lock on the MCC-1 main disconnect has no tag. Please follow up today.", evidence:"their lock on the main disconnect isn't tagged"}},
        questions:[], flags:[], links:[{field:"related_record", from:"s8"}]}
     ],
     not_recorded:[{quote:"Nobody hurt.", reason:"Supports the near-miss classification."}],
     people_mentioned:["Mike"]
   }},
  {id:"injury", title:"Hand caught at press 4", blurb:"A serious injury: the alert goes out first, people make the regulatory calls.",
   voice:{duration:"0:34"},
   text:"Thursday, about 10:40. Operator on line 2 caught his left hand between the die and the stripper plate clearing a jam on press 4. First aid at the station, then the ambulance took him to hospital. Raj, the supervisor, went with him. Press 4 is locked out and the area is taped off. Maintenance needs to check the light curtain before anyone restarts it.",
   media:[{id:"m1", kind:"photo", label:"Photo 1", caption:"Press 4, taped off"}],
   recorded:{
     media_notes:[{media:"m1", text:"DO NOT OPERATE written on the tag. Seen: caution tape across the front of press 4; a lock and tag hang on the main disconnect."}],
     events:[
       {id:"e1", summary:"Operator's hand caught in press 4 while clearing a jam"},
       {id:"e2", summary:"Light curtain check needed before press 4 restarts"}
     ],
     steps:[
       {id:"s1", event:"e1", system:"alerts", object:"message", title:"Possible serious injury at press 4", fields:{
         to:{value:"EHS manager", evidence:"the ambulance took him to hospital"},
         urgency:{value:"Immediate", evidence:"the ambulance took him to hospital"},
         message:{value:"Operator on line 2 caught a hand in press 4 while clearing a jam and went to hospital by ambulance. Press is locked out and the area is taped off.", evidence:"caught his left hand between the die and the stripper plate clearing a jam on press 4"}},
        questions:[], flags:[{kind:"fast_lane", note:"Ambulance and hospital: send before the rest of the review.", evidence:"the ambulance took him to hospital"}], links:[]},
       {id:"s2", event:"e1", system:"ehs", object:"incident", title:"Hand caught between die and stripper plate on press 4", fields:{
         incident_type:{value:"Injury or illness", evidence:"caught his left hand between the die and the stripper plate"},
         date_time:{value:"Thursday, about 10:40", evidence:"Thursday, about 10:40"},
         location:{value:"Press Line 2", evidence:"Operator on line 2"},
         description:{value:"While clearing a jam on press 4, an operator's hand was caught between the die and the stripper plate.", evidence:"clearing a jam on press 4"},
         immediate_actions:{value:"Press 4 locked out and the area taped off.", evidence:"Press 4 is locked out and the area is taped off"},
         injured_person:{value:null, evidence:""},
         injury_details:{value:"Left hand caught between the die and the stripper plate", evidence:"caught his left hand between the die and the stripper plate"},
         treatment:{value:"First aid at the station, then taken to hospital by ambulance", evidence:"First aid at the station, then the ambulance took him to hospital"},
         recordability:{value:null, evidence:""},
         regulator_report:{value:null, evidence:""}},
        questions:["Was the press locked out before the jam was cleared?","Who is the injured worker? Add the name only in the restricted field."],
        flags:[{kind:"sif_precursor", note:"Caught-in exposure at a press during jam clearing.", evidence:"clearing a jam on press 4"},{kind:"decision_needed", note:"A person must decide recordability and whether the regulator must be notified.", evidence:""}], links:[]},
       {id:"s3", event:"e2", system:"cmms", object:"work_order", title:"Check the press 4 light curtain before restart", fields:{
         asset:{value:"Press 4 light curtain", evidence:"check the light curtain"},
         location:{value:"Press Line 2", evidence:"Operator on line 2"},
         problem:{value:"Check the light curtain on press 4 before the press is restarted.", evidence:"Maintenance needs to check the light curtain before anyone restarts it"},
         work_type:{value:"Safety", evidence:"check the light curtain before anyone restarts it"},
         assigned_to:{value:"Maintenance", evidence:"Maintenance needs to check the light curtain"},
         due:{value:"Before restart", evidence:"before anyone restarts it"},
         priority:{value:null, evidence:""}},
        questions:[], flags:[], links:[]},
       {id:"s4", event:"e2", system:"ehs", object:"action", title:"Verify the light curtain before press 4 restarts", fields:{
         description:{value:"Verify the press 4 light curtain works before the press is restarted.", evidence:"Maintenance needs to check the light curtain before anyone restarts it"},
         owner:{value:"Maintenance", evidence:"Maintenance needs to check the light curtain"},
         due:{value:"Before restart", evidence:"before anyone restarts it"},
         priority:{value:null, evidence:""}},
        questions:[], flags:[], links:[{field:"work_order", from:"s3"},{field:"related_record", from:"s2"}]}
     ],
     not_recorded:[{quote:"Raj, the supervisor, went with him.", reason:"Context for the incident; no separate record."}],
     people_mentioned:["Raj"]
   }},
  {id:"roof", title:"Roof edge, Building B", blurb:"A contractor stop-work checked against the permit system.",
   voice:null,
   text:"Northline Roofing crew on the roof of building B. One worker near the west edge with no tie-off and no guardrail on that side. I stopped the job and called their supervisor. Work restarted after they put up the guardrail. Tell the contractor coordinator and check their permit covers edge work.",
   media:[{id:"m1", kind:"photo", label:"Photo 1", caption:"West edge, Building B"}],
   recorded:{
     media_notes:[{media:"m1", text:"Seen: a worker about a metre from an unprotected roof edge, no harness visible. A section of temporary guardrail lies flat on the roof."}],
     events:[{id:"e1", summary:"Roofing contractor at an open edge without fall protection; job stopped"}],
     steps:[
       {id:"s1", event:"e1", system:"ptw", object:"permit_check", title:"Check the Northline Roofing permit", fields:{
         contractor:{value:"Northline Roofing", evidence:"Northline Roofing crew on the roof of building B"},
         location:{value:"Roof - Building B", evidence:"on the roof of building B"},
         permit_number:{value:null, evidence:""}},
        questions:[], flags:[], links:[]},
       {id:"s2", event:"e1", system:"ehs", object:"contractor_obs", title:"Worker at the west roof edge without fall protection", fields:{
         contractor:{value:"Northline Roofing", evidence:"Northline Roofing crew on the roof of building B"},
         location:{value:"Roof - Building B", evidence:"on the roof of building B"},
         work_activity:{value:"Roofing work", evidence:"Northline Roofing crew on the roof"},
         finding:{value:"A worker was near the west edge with no tie-off and no guardrail on that side.", evidence:"One worker near the west edge with no tie-off and no guardrail on that side"},
         stop_work:{value:"Yes", evidence:"I stopped the job"},
         outcome:{value:"Work restarted after the guardrail was put up.", evidence:"Work restarted after they put up the guardrail"}},
        questions:[], flags:[{kind:"sif_precursor", note:"Work at an open roof edge without fall protection.", evidence:"near the west edge with no tie-off"}], links:[{field:"permit_ref", from:"s1"}]},
       {id:"s3", event:"e1", system:"alerts", object:"message", title:"Tell the contractor coordinator about the roof edge stop", fields:{
         to:{value:"Contractor coordinator", evidence:"Tell the contractor coordinator"},
         urgency:{value:null, evidence:""},
         message:{value:"A Northline Roofing worker was at the west edge of the building B roof with no tie-off or guardrail. The job was stopped and restarted after the guardrail went up.", evidence:"I stopped the job and called their supervisor"}},
        questions:["How urgent is this for the contractor coordinator?"], flags:[], links:[{field:"related_record", from:"s2"}]}
     ],
     not_recorded:[],
     people_mentioned:[]
   }},
  {id:"dock", title:"BBS cards at the dock", blurb:"Behavior cards with no names and no blame, plus a toolbox talk to schedule.",
   voice:{duration:"0:41"},
   text:"3 BBS cards at the shipping dock. Two loaders on dock 4 doing it right, gloves on and wheel chocks in before loading. Forklift driver Kevin, careless as usual, drove into a trailer on dock 3 without checking it was chocked. Gave him feedback on the spot. Housekeeping on dock 2 is bad, pallets and shrink wrap in the walkway. I'll schedule a toolbox talk on trailer chocking with the dock crew for Thursday.",
   media:[{id:"m1", kind:"photo", label:"Photo 1", caption:"Dock 2 walkway"}],
   recorded:{
     media_notes:[{media:"m1", text:"Seen: pallets and loose shrink wrap blocking about half of a marked walkway."}],
     events:[
       {id:"e1", summary:"Safe loading practice on dock 4"},
       {id:"e2", summary:"Forklift entered a trailer on dock 3 without checking chocks"},
       {id:"e3", summary:"Walkway blocked on dock 2"},
       {id:"e4", summary:"Toolbox talk on trailer chocking to schedule"}
     ],
     steps:[
       {id:"s1", event:"e1", system:"ehs", object:"observation", title:"Loaders on dock 4 used gloves and wheel chocks", fields:{
         observation:{value:"Safe", evidence:"doing it right"},
         category:{value:"Vehicles and mobile equipment", evidence:"wheel chocks in before loading"},
         location:{value:"Shipping Dock", evidence:"at the shipping dock"},
         description:{value:"Two loaders wore gloves and set wheel chocks before loading.", evidence:"gloves on and wheel chocks in before loading"},
         feedback_given:{value:null, evidence:""}},
        questions:[], flags:[], links:[]},
       {id:"s2", event:"e2", system:"ehs", object:"observation", title:"Forklift entered a trailer without checking the chocks", fields:{
         observation:{value:"At-risk", evidence:"drove into a trailer on dock 3 without checking it was chocked"},
         category:{value:"Vehicles and mobile equipment", evidence:"drove into a trailer on dock 3"},
         location:{value:"Shipping Dock", evidence:"at the shipping dock"},
         description:{value:"A forklift driver drove into a trailer at dock 3 without checking that it was chocked.", evidence:"drove into a trailer on dock 3 without checking it was chocked"},
         feedback_given:{value:"Yes", evidence:"Gave him feedback on the spot"}},
        questions:[], flags:[{kind:"sif_precursor", note:"An unchocked trailer can move while a forklift drives in.", evidence:"without checking it was chocked"}], links:[]},
       {id:"s3", event:"e3", system:"ehs", object:"concern", title:"Pallets and shrink wrap blocking the dock 2 walkway", fields:{
         concern_type:{value:"Unsafe condition", evidence:"Housekeeping on dock 2 is bad"},
         location:{value:"Shipping Dock", evidence:"Housekeeping on dock 2"},
         description:{value:"Pallets and shrink wrap are in the walkway at dock 2.", evidence:"pallets and shrink wrap in the walkway"},
         immediate_action:{value:null, evidence:""},
         potential_severity:{value:null, evidence:""}},
        questions:["Was the walkway cleared, or is it still blocked?"], flags:[], links:[]},
       {id:"s4", event:"e4", system:"ehs", object:"meeting", title:"Toolbox talk on trailer chocking with the dock crew", fields:{
         meeting_type:{value:"Toolbox talk", evidence:"I'll schedule a toolbox talk"},
         status:{value:"Scheduled", evidence:"I'll schedule a toolbox talk"},
         topic:{value:"Trailer chocking", evidence:"toolbox talk on trailer chocking"},
         group:{value:"Dock crew", evidence:"with the dock crew"},
         date:{value:"Thursday", evidence:"for Thursday"},
         attendee_count:{value:null, evidence:""},
         attendees:{value:null, evidence:""}},
        questions:[], flags:[], links:[]}
     ],
     not_recorded:[],
     people_mentioned:["Kevin"]
   }}
];
