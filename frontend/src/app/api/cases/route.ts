import {
  getAllCasesEnriched,
  addCaseToLocalStore,
  getSharedDatabase,
} from "@orchestrator/dev/localStore";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const crimeType = url.searchParams.get("crime_type");
  const district = url.searchParams.get("district");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");

  const db = getSharedDatabase();
  const allCasesEnriched = getAllCasesEnriched();

  let filtered = allCasesEnriched;

  if (crimeType && crimeType !== "all") {
    filtered = filtered.filter(
      (c) => String(c.crime_type).toLowerCase() === crimeType.toLowerCase()
    );
  }

  if (district && district !== "all") {
    filtered = filtered.filter(
      (c) => String(c.location.district).toLowerCase() === district.toLowerCase()
    );
  }

  if (status && status !== "all") {
    filtered = filtered.filter(
      (c) => String(c.status).toLowerCase() === status.toLowerCase()
    );
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        String(c.case_id).toLowerCase().includes(q) ||
        String(c.title).toLowerCase().includes(q) ||
        String(c.narrative).toLowerCase().includes(q) ||
        String(c.location?.village_or_area || "").toLowerCase().includes(q)
    );
  }

  return Response.json({
    cases: filtered,
    locations: db.Locations,
    stats: {
      total: allCasesEnriched.length,
      open: allCasesEnriched.filter((c) => c.status === "open").length,
      under_investigation: allCasesEnriched.filter((c) => c.status === "under_investigation").length,
      closed: allCasesEnriched.filter((c) => c.status === "closed").length,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      title,
      crime_type,
      district,
      area,
      narrative,
      entry_method,
      time_of_day,
      weapon_type,
      target_type,
      suspect_name,
    } = body;

    if (!title || !crime_type || !district || !narrative) {
      return Response.json(
        { error: "Title, Crime Type, District, and Narrative are required." },
        { status: 400 }
      );
    }

    const db = getSharedDatabase();
    const nextIdNumber = db.Cases.length + 1;
    const case_id = `KSP-2024-${String(nextIdNumber).padStart(3, "0")}`;

    // Find or create location
    let loc = db.Locations.find(
      (l) => String(l.district).toLowerCase() === district.toLowerCase()
    );

    const locationData = loc
      ? {
          location_id: String(loc.location_id),
          district: String(loc.district),
          taluk: String(loc.taluk || loc.district),
          village_or_area: String(loc.village_or_area || area || "Main Precinct"),
          latitude: Number(loc.latitude || 12.9716),
          longitude: Number(loc.longitude || 77.5946),
        }
      : {
          location_id: `LOC-${Date.now()}`,
          district,
          taluk: district,
          village_or_area: area || "Main Precinct Area",
          latitude: 12.9716 + (Math.random() - 0.5) * 0.2,
          longitude: 77.5946 + (Math.random() - 0.5) * 0.2,
        };

    const caseData = {
      case_id,
      title,
      crime_type,
      status: "open",
      filed_date: new Date().toISOString(),
      location_id: locationData.location_id,
      narrative,
    };

    const moData = {
      case_id,
      entry_method: entry_method || "forced_door",
      time_of_day: time_of_day || "night",
      weapon_type: weapon_type || "knife",
      victim_age_group: "adult",
      target_type: target_type || "residential",
      zia_entities_json: "{}",
    };

    addCaseToLocalStore(caseData, moData, suspect_name, locationData);

    return Response.json({
      success: true,
      case: {
        ...caseData,
        location: locationData,
        mo_features: moData,
        suspects: suspect_name ? [suspect_name] : [],
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to add case" },
      { status: 500 }
    );
  }
}
