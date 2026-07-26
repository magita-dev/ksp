/**
 * Synthetic seed data for KSP Crime AI demo.
 *
 * Contains:
 *  - 20 Locations  (Karnataka districts)
 *  - 50 Cases      (varied crime types, statuses, filed dates)
 *  - 40 Suspects   (fictional Indian names)
 *  - 50 Victims    (fictional Indian names)
 *  - 50 MO_Feature rows (one per case; 5 clusters of 8–10 cases sharing 3+ features)
 *
 * Cluster definitions:
 *  A – entry_method="forced_door", time_of_day="night",       weapon_type="knife"           (cases 01–09)
 *  B – entry_method="window",      time_of_day="afternoon",   target_type="residential"     (cases 10–18)
 *  C – entry_method="social_engineering", victim_age_group="elderly", target_type="residential" (cases 19–27)
 *  D – entry_method="forced_door", weapon_type="firearm",     target_type="commercial"      (cases 28–36)
 *  E – time_of_day="night",        weapon_type="none",        target_type="vehicle"         (cases 37–45)
 *  Misc unique cases 46–50.
 *
 * Requirements: 10.1, 10.2
 */

// ---------------------------------------------------------------------------
// Row interfaces (no ROWID — Catalyst assigns that)
// ---------------------------------------------------------------------------

export interface LocationRow {
  location_id: string;
  district: string;
  taluk: string;
  village_or_area: string;
  latitude: number;
  longitude: number;
}

export interface CaseRow {
  case_id: string;
  title: string;
  narrative: string;
  crime_type: string;
  status: string;
  filed_date: string;
  location_id: string;
}

export interface SuspectRow {
  suspect_id: string;
  name: string;
  age: number;
  known_associates: string;
  case_ids: string;
}

export interface VictimRow {
  victim_id: string;
  name: string;
  age: number;
  age_group: string;
  case_id: string;
}

export interface MOFeatureRow {
  case_id: string;
  entry_method: string;
  time_of_day: string;
  weapon_type: string;
  victim_age_group: string;
  target_type: string;
  zia_entities_json: string;
}

// ---------------------------------------------------------------------------
// Locations — 20 rows across Karnataka districts
// ---------------------------------------------------------------------------

export const LOCATIONS: LocationRow[] = [
  { location_id: "LOC-001", district: "Bengaluru Urban",  taluk: "Bengaluru North",  village_or_area: "Yelahanka",        latitude: 13.1007, longitude: 77.5963 },
  { location_id: "LOC-002", district: "Bengaluru Urban",  taluk: "Bengaluru South",  village_or_area: "Jayanagar",         latitude: 12.9250, longitude: 77.5938 },
  { location_id: "LOC-003", district: "Mysuru",           taluk: "Mysuru",           village_or_area: "Vijayanagara",      latitude: 12.3052, longitude: 76.6552 },
  { location_id: "LOC-004", district: "Mysuru",           taluk: "Nanjangud",        village_or_area: "Nanjangud Town",    latitude: 12.1194, longitude: 76.6822 },
  { location_id: "LOC-005", district: "Tumkuru",          taluk: "Tumkuru",          village_or_area: "Thimmanahalli",     latitude: 13.3409, longitude: 77.1010 },
  { location_id: "LOC-006", district: "Kalaburagi",       taluk: "Kalaburagi",       village_or_area: "Aland Road",        latitude: 17.3297, longitude: 76.8240 },
  { location_id: "LOC-007", district: "Belagavi",         taluk: "Belagavi",         village_or_area: "Shahu Nagar",       latitude: 15.8497, longitude: 74.4977 },
  { location_id: "LOC-008", district: "Belagavi",         taluk: "Gokak",            village_or_area: "Gokak Falls Area",  latitude: 16.1682, longitude: 74.6203 },
  { location_id: "LOC-009", district: "Dharwad",          taluk: "Hubli",            village_or_area: "Navanagar",         latitude: 15.3647, longitude: 75.1240 },
  { location_id: "LOC-010", district: "Dharwad",          taluk: "Dharwad",          village_or_area: "Sadashivanagar",    latitude: 15.4589, longitude: 74.9805 },
  { location_id: "LOC-011", district: "Davangere",        taluk: "Davangere",        village_or_area: "P.J. Extension",    latitude: 14.4644, longitude: 75.9218 },
  { location_id: "LOC-012", district: "Hassan",           taluk: "Hassan",           village_or_area: "Shanthinagara",     latitude: 13.0033, longitude: 76.1004 },
  { location_id: "LOC-013", district: "Shivamogga",       taluk: "Shivamogga",       village_or_area: "Kuvempu Nagar",     latitude: 13.9299, longitude: 75.5681 },
  { location_id: "LOC-014", district: "Ballari",          taluk: "Ballari",          village_or_area: "Gandhi Nagar",      latitude: 15.1394, longitude: 76.9214 },
  { location_id: "LOC-015", district: "Mandya",           taluk: "Mandya",           village_or_area: "Kasaba Hobli",      latitude: 12.5218, longitude: 76.8951 },
  { location_id: "LOC-016", district: "Kodagu",           taluk: "Madikeri",         village_or_area: "Madikeri Town",     latitude: 12.4244, longitude: 75.7382 },
  { location_id: "LOC-017", district: "Chikkaballapur",   taluk: "Chikkaballapur",   village_or_area: "Manchenahalli",     latitude: 13.4355, longitude: 77.7315 },
  { location_id: "LOC-018", district: "Ramanagara",       taluk: "Ramanagara",       village_or_area: "Ramanagara Town",   latitude: 12.7164, longitude: 77.2800 },
  { location_id: "LOC-019", district: "Chamarajanagar",   taluk: "Chamarajanagar",   village_or_area: "Yelandur Road",     latitude: 11.9207, longitude: 76.9438 },
  { location_id: "LOC-020", district: "Bengaluru Urban",  taluk: "Bengaluru East",   village_or_area: "Whitefield",        latitude: 12.9698, longitude: 77.7499 },
];

// ---------------------------------------------------------------------------
// Cases — 50 rows
// Cluster A: KSP-2024-001 … 009  (forced_door / night / knife)
// Cluster B: KSP-2024-010 … 018  (window / afternoon / residential)
// Cluster C: KSP-2024-019 … 027  (social_engineering / elderly / residential)
// Cluster D: KSP-2024-028 … 036  (forced_door / firearm / commercial)
// Cluster E: KSP-2024-037 … 045  (night / none / vehicle)
// Misc:      KSP-2024-046 … 050
// ---------------------------------------------------------------------------

export const CASES: CaseRow[] = [
  // --- Cluster A: residential night burglary with knife ---
  { case_id: "KSP-2024-001", title: "Yelahanka Night Burglary",     crime_type: "burglary",  status: "open",                filed_date: "2024-01-05T00:00:00.000Z", location_id: "LOC-001", narrative: "Suspect forced the front door after midnight and threatened the occupant with a knife before fleeing with cash." },
  { case_id: "KSP-2024-002", title: "Jayanagar Home Break-In",      crime_type: "burglary",  status: "under_investigation", filed_date: "2024-01-18T00:00:00.000Z", location_id: "LOC-002", narrative: "Door frame splintered; a knife was left at the scene; occupant was asleep when the intrusion occurred late at night." },
  { case_id: "KSP-2024-003", title: "Mysuru Night Intrusion",       crime_type: "burglary",  status: "open",                filed_date: "2024-02-03T00:00:00.000Z", location_id: "LOC-003", narrative: "Resident awoke to find the door forced open; a knife-wielding intruder had taken jewellery during the night hours." },
  { case_id: "KSP-2024-004", title: "Nanjangud Knife Robbery",      crime_type: "robbery",   status: "closed",              filed_date: "2024-02-14T00:00:00.000Z", location_id: "LOC-004", narrative: "Intruder broke through a locked door at night and held the family at knifepoint before escaping." },
  { case_id: "KSP-2024-005", title: "Tumkuru Forced Entry",         crime_type: "burglary",  status: "open",                filed_date: "2024-03-02T00:00:00.000Z", location_id: "LOC-005", narrative: "Night-time forced entry; occupant sustained minor cuts from a knife during the confrontation." },
  { case_id: "KSP-2024-006", title: "Hubli Midnight Burglary",      crime_type: "burglary",  status: "under_investigation", filed_date: "2024-03-20T00:00:00.000Z", location_id: "LOC-009", narrative: "Front door was kicked in around 2 AM; a kitchen knife was found discarded near the exit." },
  { case_id: "KSP-2024-007", title: "Davangere Night Robbery",      crime_type: "robbery",   status: "open",                filed_date: "2024-04-08T00:00:00.000Z", location_id: "LOC-011", narrative: "Assailant forced entry post-midnight wielding a knife and demanded valuables from the resident." },
  { case_id: "KSP-2024-008", title: "Hassan Night Break-In",        crime_type: "burglary",  status: "closed",              filed_date: "2024-04-22T00:00:00.000Z", location_id: "LOC-012", narrative: "Door lock was broken; victim reported a knife was used to intimidate them during the late-night theft." },
  { case_id: "KSP-2024-009", title: "Shivamogga Door-Force Case",   crime_type: "burglary",  status: "under_investigation", filed_date: "2024-05-10T00:00:00.000Z", location_id: "LOC-013", narrative: "Perpetrator forced the door open at night and brandished a knife before stealing electronics." },

  // --- Cluster B: daytime window break-in (residential) ---
  { case_id: "KSP-2024-010", title: "Whitefield Afternoon Break-In",    crime_type: "burglary",  status: "open",                filed_date: "2024-01-09T00:00:00.000Z", location_id: "LOC-020", narrative: "Intruder entered through a ground-floor window while occupants were away during afternoon hours." },
  { case_id: "KSP-2024-011", title: "Jayanagar Window Theft",           crime_type: "theft",     status: "closed",              filed_date: "2024-01-25T00:00:00.000Z", location_id: "LOC-002", narrative: "Neighbour noticed a window pried open on a weekday afternoon; cash and jewellery were missing." },
  { case_id: "KSP-2024-012", title: "Mysuru Residential Window Entry",  crime_type: "burglary",  status: "open",                filed_date: "2024-02-07T00:00:00.000Z", location_id: "LOC-003", narrative: "Thief slipped through a broken window in the afternoon while the family was at work." },
  { case_id: "KSP-2024-013", title: "Ramanagara Afternoon Intrusion",   crime_type: "burglary",  status: "under_investigation", filed_date: "2024-02-19T00:00:00.000Z", location_id: "LOC-018", narrative: "Window latch was forced open; entry and exit took place in the afternoon when the house was unoccupied." },
  { case_id: "KSP-2024-014", title: "Tumkuru Window Burglary",          crime_type: "burglary",  status: "open",                filed_date: "2024-03-05T00:00:00.000Z", location_id: "LOC-005", narrative: "Resident returned from school pick-up in the afternoon to find the bedroom window broken and valuables gone." },
  { case_id: "KSP-2024-015", title: "Mandya Afternoon House Theft",     crime_type: "theft",     status: "closed",              filed_date: "2024-03-22T00:00:00.000Z", location_id: "LOC-015", narrative: "Perpetrator accessed the house through a side window in the afternoon and took electronic items." },
  { case_id: "KSP-2024-016", title: "Chikkaballapur Window Break",      crime_type: "burglary",  status: "under_investigation", filed_date: "2024-04-12T00:00:00.000Z", location_id: "LOC-017", narrative: "Window bar was bent outward; the break-in happened between 1 PM and 3 PM while residents were at work." },
  { case_id: "KSP-2024-017", title: "Belagavi Afternoon Residential",   crime_type: "burglary",  status: "open",                filed_date: "2024-04-28T00:00:00.000Z", location_id: "LOC-007", narrative: "Entry via sliding window in the afternoon; silverware and laptop stolen from a residential property." },
  { case_id: "KSP-2024-018", title: "Kalaburagi Window Intrusion",      crime_type: "burglary",  status: "under_investigation", filed_date: "2024-05-14T00:00:00.000Z", location_id: "LOC-006", narrative: "First-floor window was left unlatched; thief gained entry in the afternoon and fled before the family returned." },

  // --- Cluster C: social engineering / elder fraud ---
  { case_id: "KSP-2024-019", title: "Yelahanka Elder Fraud",              crime_type: "fraud",         status: "open",                filed_date: "2024-01-12T00:00:00.000Z", location_id: "LOC-001", narrative: "Suspect posed as a government official and convinced an elderly resident to hand over savings documents." },
  { case_id: "KSP-2024-020", title: "Mysuru Elderly Home Deceit",         crime_type: "fraud",         status: "under_investigation", filed_date: "2024-01-28T00:00:00.000Z", location_id: "LOC-003", narrative: "Elderly woman was tricked into signing documents after a visitor claimed to be conducting a welfare survey." },
  { case_id: "KSP-2024-021", title: "Hassan Pensioner Scam",              crime_type: "cheating",      status: "open",                filed_date: "2024-02-10T00:00:00.000Z", location_id: "LOC-012", narrative: "Retired gentleman was defrauded when callers posing as bank staff extracted OTPs and drained his account." },
  { case_id: "KSP-2024-022", title: "Mandya Elder Deception",             crime_type: "fraud",         status: "closed",              filed_date: "2024-02-24T00:00:00.000Z", location_id: "LOC-015", narrative: "Social engineering scheme targeting elderly resident; suspect gained trust before stealing a gold chain inside the house." },
  { case_id: "KSP-2024-023", title: "Davangere Elderly Resident Fraud",   crime_type: "cheating",      status: "open",                filed_date: "2024-03-08T00:00:00.000Z", location_id: "LOC-011", narrative: "Elderly couple were persuaded to allow entry by a person claiming to be a utility inspector who then stole cash." },
  { case_id: "KSP-2024-024", title: "Kodagu Elder Con",                   crime_type: "fraud",         status: "under_investigation", filed_date: "2024-03-25T00:00:00.000Z", location_id: "LOC-016", narrative: "Suspect used a forged ID to convince an elderly widow to handover jewellery for supposed safekeeping." },
  { case_id: "KSP-2024-025", title: "Chamarajanagar Elder Fraud",         crime_type: "fraud",         status: "open",                filed_date: "2024-04-14T00:00:00.000Z", location_id: "LOC-019", narrative: "Group of fraudsters posed as healthcare workers and stole cash from an elderly patient's home." },
  { case_id: "KSP-2024-026", title: "Shivamogga Elderly Cheating Case",   crime_type: "cheating",      status: "under_investigation", filed_date: "2024-04-30T00:00:00.000Z", location_id: "LOC-013", narrative: "Elderly man was duped after a stranger offered help carrying groceries and entered the house under pretence." },
  { case_id: "KSP-2024-027", title: "Dharwad Pensioner Social Engineering", crime_type: "fraud",       status: "open",                filed_date: "2024-05-16T00:00:00.000Z", location_id: "LOC-010", narrative: "Retired teacher targeted through a phone call; social engineering led to transfer of funds to a fraudulent account." },

  // --- Cluster D: forced-door armed robbery (commercial) ---
  { case_id: "KSP-2024-028", title: "Kalaburagi Shop Armed Robbery",     crime_type: "robbery",  status: "open",                filed_date: "2024-01-15T00:00:00.000Z", location_id: "LOC-006", narrative: "Armed men forced the shutter of a jewellery shop and held staff at gunpoint before escaping with inventory." },
  { case_id: "KSP-2024-029", title: "Belagavi Commercial Heist",         crime_type: "robbery",  status: "under_investigation", filed_date: "2024-01-30T00:00:00.000Z", location_id: "LOC-007", narrative: "Three masked suspects forced the office door and brandished firearms, coercing staff to open the safe." },
  { case_id: "KSP-2024-030", title: "Hubli Bank Counter Robbery",        crime_type: "robbery",  status: "closed",              filed_date: "2024-02-13T00:00:00.000Z", location_id: "LOC-009", narrative: "Armed robbers broke through the service entrance of a cooperative bank and held tellers at gunpoint." },
  { case_id: "KSP-2024-031", title: "Ballari Petrol Pump Robbery",       crime_type: "robbery",  status: "open",                filed_date: "2024-02-26T00:00:00.000Z", location_id: "LOC-014", narrative: "Suspects forced the pump's cash cabin door and produced a firearm before fleeing on a motorcycle." },
  { case_id: "KSP-2024-032", title: "Davangere Commercial Looting",      crime_type: "robbery",  status: "under_investigation", filed_date: "2024-03-11T00:00:00.000Z", location_id: "LOC-011", narrative: "Door of a textile warehouse was rammed open; armed suspects confined workers and looted cash from the counter." },
  { case_id: "KSP-2024-033", title: "Tumkuru Store Armed Break-In",      crime_type: "robbery",  status: "open",                filed_date: "2024-03-27T00:00:00.000Z", location_id: "LOC-005", narrative: "Late-evening forced entry into a supermarket; suspects carried firearms and threatened the cashier." },
  { case_id: "KSP-2024-034", title: "Mysuru Gold Shop Robbery",          crime_type: "robbery",  status: "closed",              filed_date: "2024-04-15T00:00:00.000Z", location_id: "LOC-003", narrative: "Robbers pried the shutters of a gold shop open and pointed a firearm at the jeweller to demand compliance." },
  { case_id: "KSP-2024-035", title: "Dharwad Office Cash Theft",         crime_type: "robbery",  status: "under_investigation", filed_date: "2024-05-01T00:00:00.000Z", location_id: "LOC-009", narrative: "Commercial office door was forced; employees overpowered at gunpoint and cash from the payroll room stolen." },
  { case_id: "KSP-2024-036", title: "Ramanagara ATM Robbery Attempt",    crime_type: "robbery",  status: "open",                filed_date: "2024-05-18T00:00:00.000Z", location_id: "LOC-018", narrative: "Suspects attempted to force the ATM enclosure door using tools; a firearm was recovered near the scene." },

  // --- Cluster E: vehicle theft at night (no weapon) ---
  { case_id: "KSP-2024-037", title: "Whitefield Car Theft",              crime_type: "theft",     status: "open",                filed_date: "2024-01-20T00:00:00.000Z", location_id: "LOC-020", narrative: "Owner found the car missing from the apartment parking lot the next morning; theft occurred overnight." },
  { case_id: "KSP-2024-038", title: "Yelahanka Motorcycle Theft",        crime_type: "theft",     status: "closed",              filed_date: "2024-02-05T00:00:00.000Z", location_id: "LOC-001", narrative: "Motorcycle was stolen from in front of the house during late-night hours without any confrontation." },
  { case_id: "KSP-2024-039", title: "Jayanagar Auto Theft",              crime_type: "theft",     status: "under_investigation", filed_date: "2024-02-20T00:00:00.000Z", location_id: "LOC-002", narrative: "Three-wheeler autorickshaw went missing from the stand overnight; no suspects seen, no weapons involved." },
  { case_id: "KSP-2024-040", title: "Mysuru Car Stolen",                 crime_type: "theft",     status: "open",                filed_date: "2024-03-06T00:00:00.000Z", location_id: "LOC-003", narrative: "Sedan was taken from a quiet street in the middle of the night using what appeared to be a duplicate key." },
  { case_id: "KSP-2024-041", title: "Belagavi Night Vehicle Theft",      crime_type: "theft",     status: "under_investigation", filed_date: "2024-03-23T00:00:00.000Z", location_id: "LOC-007", narrative: "Cargo van stolen from a commercial premises at night; CCTV shows no weapons, suspect worked alone." },
  { case_id: "KSP-2024-042", title: "Hassan Two-Wheeler Theft",          crime_type: "theft",     status: "open",                filed_date: "2024-04-09T00:00:00.000Z", location_id: "LOC-012", narrative: "Hero bike vanished from the road outside a residence at night; neighbours heard nothing unusual." },
  { case_id: "KSP-2024-043", title: "Ballari Pickup Truck Theft",        crime_type: "theft",     status: "closed",              filed_date: "2024-04-25T00:00:00.000Z", location_id: "LOC-014", narrative: "Pickup truck reported missing after overnight parking near the market; recovered 100 km away, no weapon involved." },
  { case_id: "KSP-2024-044", title: "Chikkaballapur Car Theft",          crime_type: "theft",     status: "open",                filed_date: "2024-05-08T00:00:00.000Z", location_id: "LOC-017", narrative: "Vehicle lifted from a residential area during nighttime; theft appeared opportunistic with no weapon traces." },
  { case_id: "KSP-2024-045", title: "Mandya Scooter Theft",              crime_type: "theft",     status: "under_investigation", filed_date: "2024-05-22T00:00:00.000Z", location_id: "LOC-015", narrative: "Electric scooter taken from outside a store in the dead of night; no confrontation, no weapon used." },

  // --- Miscellaneous (unique MO combinations) ---
  { case_id: "KSP-2024-046", title: "Kodagu Plantation Trespass",         crime_type: "trespass",          status: "open",                filed_date: "2024-01-22T00:00:00.000Z", location_id: "LOC-016", narrative: "Unauthorised individuals entered a coffee plantation boundary in the morning and harvested crops." },
  { case_id: "KSP-2024-047", title: "Chamarajanagar Forest Produce Theft", crime_type: "theft",            status: "under_investigation", filed_date: "2024-02-28T00:00:00.000Z", location_id: "LOC-019", narrative: "Sandalwood billets found missing from a forest depot; removal believed to be during evening hours." },
  { case_id: "KSP-2024-048", title: "Gokak River-Bank Robbery",           crime_type: "robbery",           status: "closed",              filed_date: "2024-03-14T00:00:00.000Z", location_id: "LOC-008", narrative: "Tourists were robbed of belongings by a group displaying machetes near a riverside viewpoint." },
  { case_id: "KSP-2024-049", title: "Ballari Hit-and-Run Case",           crime_type: "hit_and_run",       status: "open",                filed_date: "2024-04-01T00:00:00.000Z", location_id: "LOC-014", narrative: "Cyclist was struck by an unidentified vehicle in the evening and the driver fled without stopping." },
  { case_id: "KSP-2024-050", title: "Tumkuru Cyber Fraud",                crime_type: "cyber_fraud",       status: "under_investigation", filed_date: "2024-05-25T00:00:00.000Z", location_id: "LOC-005", narrative: "Victim received a fraudulent loan-approval link via SMS and transferred funds before realising the deception." },
];

// ---------------------------------------------------------------------------
// Suspects — 40 rows (fictional Indian names, no real PII)
// ---------------------------------------------------------------------------

export const SUSPECTS: SuspectRow[] = [
  { suspect_id: "SUS-001", name: "Ravi Kumar Shetty",      age: 34, known_associates: '["SUS-002","SUS-003"]', case_ids: '["KSP-2024-001","KSP-2024-002"]' },
  { suspect_id: "SUS-002", name: "Manoj Gowda",            age: 28, known_associates: '["SUS-001"]',           case_ids: '["KSP-2024-002","KSP-2024-003"]' },
  { suspect_id: "SUS-003", name: "Suresh Naik",            age: 41, known_associates: '["SUS-001","SUS-004"]', case_ids: '["KSP-2024-004","KSP-2024-005"]' },
  { suspect_id: "SUS-004", name: "Basavaraj Patil",        age: 36, known_associates: '["SUS-003"]',           case_ids: '["KSP-2024-005","KSP-2024-006"]' },
  { suspect_id: "SUS-005", name: "Girish Hegde",           age: 29, known_associates: '["SUS-006"]',           case_ids: '["KSP-2024-007","KSP-2024-008"]' },
  { suspect_id: "SUS-006", name: "Venkatesh Reddy",        age: 45, known_associates: '["SUS-005","SUS-007"]', case_ids: '["KSP-2024-008","KSP-2024-009"]' },
  { suspect_id: "SUS-007", name: "Arjun Prasad",           age: 31, known_associates: '["SUS-006"]',           case_ids: '["KSP-2024-009"]' },
  { suspect_id: "SUS-008", name: "Deepak Rao",             age: 27, known_associates: '["SUS-009"]',           case_ids: '["KSP-2024-010","KSP-2024-011"]' },
  { suspect_id: "SUS-009", name: "Nagesh Murthy",          age: 33, known_associates: '["SUS-008","SUS-010"]', case_ids: '["KSP-2024-011","KSP-2024-012"]' },
  { suspect_id: "SUS-010", name: "Pavan Kumari",           age: 24, known_associates: '["SUS-009"]',           case_ids: '["KSP-2024-013","KSP-2024-014"]' },
  { suspect_id: "SUS-011", name: "Srinivas Kamath",        age: 38, known_associates: '[]',                   case_ids: '["KSP-2024-015","KSP-2024-016"]' },
  { suspect_id: "SUS-012", name: "Ramesh Nair",            age: 44, known_associates: '["SUS-013"]',           case_ids: '["KSP-2024-016","KSP-2024-017"]' },
  { suspect_id: "SUS-013", name: "Kiran Joshi",            age: 30, known_associates: '["SUS-012"]',           case_ids: '["KSP-2024-018"]' },
  { suspect_id: "SUS-014", name: "Mohan Bhat",             age: 52, known_associates: '["SUS-015","SUS-016"]', case_ids: '["KSP-2024-019","KSP-2024-020"]' },
  { suspect_id: "SUS-015", name: "Prakash Verma",          age: 48, known_associates: '["SUS-014"]',           case_ids: '["KSP-2024-021","KSP-2024-022"]' },
  { suspect_id: "SUS-016", name: "Anand Chandra",          age: 39, known_associates: '["SUS-014","SUS-017"]', case_ids: '["KSP-2024-022","KSP-2024-023"]' },
  { suspect_id: "SUS-017", name: "Uday Kulkarni",          age: 55, known_associates: '["SUS-016"]',           case_ids: '["KSP-2024-024","KSP-2024-025"]' },
  { suspect_id: "SUS-018", name: "Santosh Desai",          age: 43, known_associates: '["SUS-019"]',           case_ids: '["KSP-2024-026","KSP-2024-027"]' },
  { suspect_id: "SUS-019", name: "Vijay Menon",            age: 37, known_associates: '["SUS-018"]',           case_ids: '["KSP-2024-027"]' },
  { suspect_id: "SUS-020", name: "Harish Bangera",         age: 32, known_associates: '["SUS-021","SUS-022"]', case_ids: '["KSP-2024-028","KSP-2024-029"]' },
  { suspect_id: "SUS-021", name: "Sunil Venugopal",        age: 26, known_associates: '["SUS-020"]',           case_ids: '["KSP-2024-029","KSP-2024-030"]' },
  { suspect_id: "SUS-022", name: "Arun Narayanan",         age: 35, known_associates: '["SUS-020","SUS-023"]', case_ids: '["KSP-2024-030","KSP-2024-031"]' },
  { suspect_id: "SUS-023", name: "Ganesh Pillai",          age: 40, known_associates: '["SUS-022"]',           case_ids: '["KSP-2024-032","KSP-2024-033"]' },
  { suspect_id: "SUS-024", name: "Rajesh Iyer",            age: 46, known_associates: '["SUS-025"]',           case_ids: '["KSP-2024-033","KSP-2024-034"]' },
  { suspect_id: "SUS-025", name: "Madhu Chakravarthy",     age: 29, known_associates: '["SUS-024"]',           case_ids: '["KSP-2024-035","KSP-2024-036"]' },
  { suspect_id: "SUS-026", name: "Karthik Subramanian",    age: 23, known_associates: '["SUS-027"]',           case_ids: '["KSP-2024-037","KSP-2024-038"]' },
  { suspect_id: "SUS-027", name: "Naveen Krishnamurthy",   age: 31, known_associates: '["SUS-026","SUS-028"]', case_ids: '["KSP-2024-038","KSP-2024-039"]' },
  { suspect_id: "SUS-028", name: "Pradeep Srinivasan",     age: 27, known_associates: '["SUS-027"]',           case_ids: '["KSP-2024-040","KSP-2024-041"]' },
  { suspect_id: "SUS-029", name: "Lokesh Gowda",           age: 34, known_associates: '[]',                   case_ids: '["KSP-2024-042","KSP-2024-043"]' },
  { suspect_id: "SUS-030", name: "Santosh Kumar Das",      age: 42, known_associates: '["SUS-031"]',           case_ids: '["KSP-2024-043","KSP-2024-044"]' },
  { suspect_id: "SUS-031", name: "Dinesh Patel",           age: 38, known_associates: '["SUS-030"]',           case_ids: '["KSP-2024-045"]' },
  { suspect_id: "SUS-032", name: "Chandrashekar Bhatt",    age: 50, known_associates: '[]',                   case_ids: '["KSP-2024-046"]' },
  { suspect_id: "SUS-033", name: "Niranjan Belur",         age: 36, known_associates: '["SUS-034"]',           case_ids: '["KSP-2024-047"]' },
  { suspect_id: "SUS-034", name: "Shreyas Uppoor",         age: 25, known_associates: '["SUS-033"]',           case_ids: '["KSP-2024-047","KSP-2024-048"]' },
  { suspect_id: "SUS-035", name: "Mithun Alva",            age: 33, known_associates: '["SUS-036","SUS-037"]', case_ids: '["KSP-2024-048"]' },
  { suspect_id: "SUS-036", name: "Hemanth Poojari",        age: 29, known_associates: '["SUS-035"]',           case_ids: '["KSP-2024-048"]' },
  { suspect_id: "SUS-037", name: "Akash Shettigar",        age: 22, known_associates: '["SUS-035"]',           case_ids: '["KSP-2024-049"]' },
  { suspect_id: "SUS-038", name: "Yashwanth Rao",          age: 47, known_associates: '[]',                   case_ids: '["KSP-2024-049"]' },
  { suspect_id: "SUS-039", name: "Ashwin Karanth",         age: 30, known_associates: '["SUS-040"]',           case_ids: '["KSP-2024-050"]' },
  { suspect_id: "SUS-040", name: "Rohan Shenoy",           age: 28, known_associates: '["SUS-039"]',           case_ids: '["KSP-2024-050"]' },
];

// ---------------------------------------------------------------------------
// Victims — 50 rows (fictional Indian names, one per case)
// ---------------------------------------------------------------------------

export const VICTIMS: VictimRow[] = [
  { victim_id: "VIC-001", name: "Lakshmi Devi",          age: 45, age_group: "adult",   case_id: "KSP-2024-001" },
  { victim_id: "VIC-002", name: "Subbamma Reddy",        age: 58, age_group: "adult",   case_id: "KSP-2024-002" },
  { victim_id: "VIC-003", name: "Priya Nair",            age: 32, age_group: "adult",   case_id: "KSP-2024-003" },
  { victim_id: "VIC-004", name: "Geetha Patil",          age: 41, age_group: "adult",   case_id: "KSP-2024-004" },
  { victim_id: "VIC-005", name: "Kavitha Sharma",        age: 29, age_group: "youth",   case_id: "KSP-2024-005" },
  { victim_id: "VIC-006", name: "Meena Naik",            age: 50, age_group: "adult",   case_id: "KSP-2024-006" },
  { victim_id: "VIC-007", name: "Savitha Kumar",         age: 37, age_group: "adult",   case_id: "KSP-2024-007" },
  { victim_id: "VIC-008", name: "Usha Rani",             age: 44, age_group: "adult",   case_id: "KSP-2024-008" },
  { victim_id: "VIC-009", name: "Padmavathi Gowda",      age: 52, age_group: "adult",   case_id: "KSP-2024-009" },
  { victim_id: "VIC-010", name: "Sunitha Bhat",          age: 34, age_group: "adult",   case_id: "KSP-2024-010" },
  { victim_id: "VIC-011", name: "Nagalakshmi Rao",       age: 27, age_group: "youth",   case_id: "KSP-2024-011" },
  { victim_id: "VIC-012", name: "Vidya Srinivas",        age: 39, age_group: "adult",   case_id: "KSP-2024-012" },
  { victim_id: "VIC-013", name: "Anitha Murthy",         age: 46, age_group: "adult",   case_id: "KSP-2024-013" },
  { victim_id: "VIC-014", name: "Roopa Hegde",           age: 31, age_group: "adult",   case_id: "KSP-2024-014" },
  { victim_id: "VIC-015", name: "Shantha Kulkarni",      age: 55, age_group: "adult",   case_id: "KSP-2024-015" },
  { victim_id: "VIC-016", name: "Deepa Kamath",          age: 23, age_group: "youth",   case_id: "KSP-2024-016" },
  { victim_id: "VIC-017", name: "Sujatha Pillai",        age: 48, age_group: "adult",   case_id: "KSP-2024-017" },
  { victim_id: "VIC-018", name: "Rekha Joshi",           age: 36, age_group: "adult",   case_id: "KSP-2024-018" },
  { victim_id: "VIC-019", name: "Yellamma Swamy",        age: 72, age_group: "elderly", case_id: "KSP-2024-019" },
  { victim_id: "VIC-020", name: "Gangamma Nayak",        age: 68, age_group: "elderly", case_id: "KSP-2024-020" },
  { victim_id: "VIC-021", name: "Veeraiah Naidu",        age: 75, age_group: "elderly", case_id: "KSP-2024-021" },
  { victim_id: "VIC-022", name: "Subbaiah Mudaliar",     age: 70, age_group: "elderly", case_id: "KSP-2024-022" },
  { victim_id: "VIC-023", name: "Basamma Lingaiah",      age: 65, age_group: "elderly", case_id: "KSP-2024-023" },
  { victim_id: "VIC-024", name: "Chikkamma Venkatesh",   age: 78, age_group: "elderly", case_id: "KSP-2024-024" },
  { victim_id: "VIC-025", name: "Puttamma Rangaiah",     age: 66, age_group: "elderly", case_id: "KSP-2024-025" },
  { victim_id: "VIC-026", name: "Kamaiah Thimmappa",     age: 71, age_group: "elderly", case_id: "KSP-2024-026" },
  { victim_id: "VIC-027", name: "Obaiah Muniswamy",      age: 63, age_group: "elderly", case_id: "KSP-2024-027" },
  { victim_id: "VIC-028", name: "Ibrahim Sharief",       age: 40, age_group: "adult",   case_id: "KSP-2024-028" },
  { victim_id: "VIC-029", name: "Ashok Mehta",           age: 35, age_group: "adult",   case_id: "KSP-2024-029" },
  { victim_id: "VIC-030", name: "Ramachandran Iyer",     age: 50, age_group: "adult",   case_id: "KSP-2024-030" },
  { victim_id: "VIC-031", name: "Shabbir Ahmed",         age: 44, age_group: "adult",   case_id: "KSP-2024-031" },
  { victim_id: "VIC-032", name: "Manjunath Gowda",       age: 38, age_group: "adult",   case_id: "KSP-2024-032" },
  { victim_id: "VIC-033", name: "Prasad Venkataramaiah", age: 52, age_group: "adult",   case_id: "KSP-2024-033" },
  { victim_id: "VIC-034", name: "Nagaraj Shetty",        age: 47, age_group: "adult",   case_id: "KSP-2024-034" },
  { victim_id: "VIC-035", name: "Harisha Bankapur",      age: 33, age_group: "adult",   case_id: "KSP-2024-035" },
  { victim_id: "VIC-036", name: "Lakshmikanth Hubballi", age: 29, age_group: "youth",   case_id: "KSP-2024-036" },
  { victim_id: "VIC-037", name: "Sumanth Reddy",         age: 26, age_group: "youth",   case_id: "KSP-2024-037" },
  { victim_id: "VIC-038", name: "Naveen Prashanth",      age: 22, age_group: "youth",   case_id: "KSP-2024-038" },
  { victim_id: "VIC-039", name: "Tejas Gowda",           age: 30, age_group: "adult",   case_id: "KSP-2024-039" },
  { victim_id: "VIC-040", name: "Pooja Srinivasan",      age: 28, age_group: "youth",   case_id: "KSP-2024-040" },
  { victim_id: "VIC-041", name: "Bhargavi Venkatesh",    age: 35, age_group: "adult",   case_id: "KSP-2024-041" },
  { victim_id: "VIC-042", name: "Divya Menon",           age: 41, age_group: "adult",   case_id: "KSP-2024-042" },
  { victim_id: "VIC-043", name: "Ashwini Hegde",         age: 19, age_group: "youth",   case_id: "KSP-2024-043" },
  { victim_id: "VIC-044", name: "Chaitra Kulkarni",      age: 24, age_group: "youth",   case_id: "KSP-2024-044" },
  { victim_id: "VIC-045", name: "Smitha Belur",          age: 32, age_group: "adult",   case_id: "KSP-2024-045" },
  { victim_id: "VIC-046", name: "Krishnaswamy Hebbar",   age: 59, age_group: "adult",   case_id: "KSP-2024-046" },
  { victim_id: "VIC-047", name: "Rathna Bai",            age: 48, age_group: "adult",   case_id: "KSP-2024-047" },
  { victim_id: "VIC-048", name: "Mahesh Kadam",          age: 36, age_group: "adult",   case_id: "KSP-2024-048" },
  { victim_id: "VIC-049", name: "Suma Nagaraj",          age: 17, age_group: "child",   case_id: "KSP-2024-049" },
  { victim_id: "VIC-050", name: "Arathi Shanbhag",       age: 43, age_group: "adult",   case_id: "KSP-2024-050" },
];

// ---------------------------------------------------------------------------
// MO_Features — 50 rows (one per case)
//
// Cluster A (cases 001-009): entry_method="forced_door", time_of_day="night", weapon_type="knife"
// Cluster B (cases 010-018): entry_method="window",      time_of_day="afternoon", target_type="residential"
// Cluster C (cases 019-027): entry_method="social_engineering", victim_age_group="elderly", target_type="residential"
// Cluster D (cases 028-036): entry_method="forced_door", weapon_type="firearm", target_type="commercial"
// Cluster E (cases 037-045): time_of_day="night", weapon_type="none", target_type="vehicle"
// Misc (cases 046-050): varied
// ---------------------------------------------------------------------------

export const MO_FEATURES: MOFeatureRow[] = [
  // --- Cluster A ---
  { case_id: "KSP-2024-001", entry_method: "forced_door",        time_of_day: "night",     weapon_type: "knife",    victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-002", entry_method: "forced_door",        time_of_day: "night",     weapon_type: "knife",    victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-003", entry_method: "forced_door",        time_of_day: "night",     weapon_type: "knife",    victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-004", entry_method: "forced_door",        time_of_day: "night",     weapon_type: "knife",    victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-005", entry_method: "forced_door",        time_of_day: "night",     weapon_type: "knife",    victim_age_group: "youth",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-006", entry_method: "forced_door",        time_of_day: "night",     weapon_type: "knife",    victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-007", entry_method: "forced_door",        time_of_day: "night",     weapon_type: "knife",    victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-008", entry_method: "forced_door",        time_of_day: "night",     weapon_type: "knife",    victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-009", entry_method: "forced_door",        time_of_day: "night",     weapon_type: "knife",    victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },

  // --- Cluster B ---
  { case_id: "KSP-2024-010", entry_method: "window",             time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-011", entry_method: "window",             time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "youth",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-012", entry_method: "window",             time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-013", entry_method: "window",             time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-014", entry_method: "window",             time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-015", entry_method: "window",             time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-016", entry_method: "window",             time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "youth",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-017", entry_method: "window",             time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-018", entry_method: "window",             time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "adult",   target_type: "residential", zia_entities_json: "[]" },

  // --- Cluster C ---
  { case_id: "KSP-2024-019", entry_method: "social_engineering", time_of_day: "morning",   weapon_type: "none",     victim_age_group: "elderly", target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-020", entry_method: "social_engineering", time_of_day: "morning",   weapon_type: "none",     victim_age_group: "elderly", target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-021", entry_method: "social_engineering", time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "elderly", target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-022", entry_method: "social_engineering", time_of_day: "morning",   weapon_type: "none",     victim_age_group: "elderly", target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-023", entry_method: "social_engineering", time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "elderly", target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-024", entry_method: "social_engineering", time_of_day: "morning",   weapon_type: "none",     victim_age_group: "elderly", target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-025", entry_method: "social_engineering", time_of_day: "morning",   weapon_type: "none",     victim_age_group: "elderly", target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-026", entry_method: "social_engineering", time_of_day: "evening",   weapon_type: "none",     victim_age_group: "elderly", target_type: "residential", zia_entities_json: "[]" },
  { case_id: "KSP-2024-027", entry_method: "social_engineering", time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "elderly", target_type: "residential", zia_entities_json: "[]" },

  // --- Cluster D ---
  { case_id: "KSP-2024-028", entry_method: "forced_door",        time_of_day: "evening",   weapon_type: "firearm",  victim_age_group: "adult",   target_type: "commercial", zia_entities_json: "[]" },
  { case_id: "KSP-2024-029", entry_method: "forced_door",        time_of_day: "morning",   weapon_type: "firearm",  victim_age_group: "adult",   target_type: "commercial", zia_entities_json: "[]" },
  { case_id: "KSP-2024-030", entry_method: "forced_door",        time_of_day: "morning",   weapon_type: "firearm",  victim_age_group: "adult",   target_type: "commercial", zia_entities_json: "[]" },
  { case_id: "KSP-2024-031", entry_method: "forced_door",        time_of_day: "evening",   weapon_type: "firearm",  victim_age_group: "adult",   target_type: "commercial", zia_entities_json: "[]" },
  { case_id: "KSP-2024-032", entry_method: "forced_door",        time_of_day: "morning",   weapon_type: "firearm",  victim_age_group: "adult",   target_type: "commercial", zia_entities_json: "[]" },
  { case_id: "KSP-2024-033", entry_method: "forced_door",        time_of_day: "evening",   weapon_type: "firearm",  victim_age_group: "adult",   target_type: "commercial", zia_entities_json: "[]" },
  { case_id: "KSP-2024-034", entry_method: "forced_door",        time_of_day: "morning",   weapon_type: "firearm",  victim_age_group: "adult",   target_type: "commercial", zia_entities_json: "[]" },
  { case_id: "KSP-2024-035", entry_method: "forced_door",        time_of_day: "morning",   weapon_type: "firearm",  victim_age_group: "adult",   target_type: "commercial", zia_entities_json: "[]" },
  { case_id: "KSP-2024-036", entry_method: "forced_door",        time_of_day: "evening",   weapon_type: "firearm",  victim_age_group: "youth",   target_type: "commercial", zia_entities_json: "[]" },

  // --- Cluster E ---
  { case_id: "KSP-2024-037", entry_method: "lock_pick",          time_of_day: "night",     weapon_type: "none",     victim_age_group: "youth",   target_type: "vehicle", zia_entities_json: "[]" },
  { case_id: "KSP-2024-038", entry_method: "duplicate_key",      time_of_day: "night",     weapon_type: "none",     victim_age_group: "youth",   target_type: "vehicle", zia_entities_json: "[]" },
  { case_id: "KSP-2024-039", entry_method: "lock_pick",          time_of_day: "night",     weapon_type: "none",     victim_age_group: "adult",   target_type: "vehicle", zia_entities_json: "[]" },
  { case_id: "KSP-2024-040", entry_method: "duplicate_key",      time_of_day: "night",     weapon_type: "none",     victim_age_group: "youth",   target_type: "vehicle", zia_entities_json: "[]" },
  { case_id: "KSP-2024-041", entry_method: "lock_pick",          time_of_day: "night",     weapon_type: "none",     victim_age_group: "adult",   target_type: "vehicle", zia_entities_json: "[]" },
  { case_id: "KSP-2024-042", entry_method: "duplicate_key",      time_of_day: "night",     weapon_type: "none",     victim_age_group: "adult",   target_type: "vehicle", zia_entities_json: "[]" },
  { case_id: "KSP-2024-043", entry_method: "lock_pick",          time_of_day: "night",     weapon_type: "none",     victim_age_group: "youth",   target_type: "vehicle", zia_entities_json: "[]" },
  { case_id: "KSP-2024-044", entry_method: "duplicate_key",      time_of_day: "night",     weapon_type: "none",     victim_age_group: "youth",   target_type: "vehicle", zia_entities_json: "[]" },
  { case_id: "KSP-2024-045", entry_method: "lock_pick",          time_of_day: "night",     weapon_type: "none",     victim_age_group: "adult",   target_type: "vehicle", zia_entities_json: "[]" },

  // --- Miscellaneous ---
  { case_id: "KSP-2024-046", entry_method: "open_access",        time_of_day: "morning",   weapon_type: "none",     victim_age_group: "adult",   target_type: "agricultural", zia_entities_json: "[]" },
  { case_id: "KSP-2024-047", entry_method: "lock_pick",          time_of_day: "evening",   weapon_type: "blunt",    victim_age_group: "adult",   target_type: "government",   zia_entities_json: "[]" },
  { case_id: "KSP-2024-048", entry_method: "open_access",        time_of_day: "afternoon", weapon_type: "machete",  victim_age_group: "adult",   target_type: "public_space", zia_entities_json: "[]" },
  { case_id: "KSP-2024-049", entry_method: "vehicle",            time_of_day: "evening",   weapon_type: "vehicle",  victim_age_group: "child",   target_type: "road",         zia_entities_json: "[]" },
  { case_id: "KSP-2024-050", entry_method: "social_engineering", time_of_day: "afternoon", weapon_type: "none",     victim_age_group: "adult",   target_type: "digital",      zia_entities_json: "[]" },
];
