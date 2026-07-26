import jsPDF from "jspdf";

export interface CasePdfData {
  case_id: string;
  title: string;
  crime_type: string;
  status: string;
  filed_date: string;
  narrative: string;
  location?: {
    district: string;
    taluk?: string;
    village_or_area: string;
  };
  mo_features?: {
    entry_method?: string;
    time_of_day?: string;
    weapon_type?: string;
    target_type?: string;
  };
  suspects?: string[];
  officerName?: string;
  badgeNumber?: string;
  tier?: string;
}

export function generateCasePdf(data: CasePdfData) {
  const doc = new jsPDF();

  // Header Bar - KSP Khaki / Gold Accent
  doc.setFillColor(15, 23, 42); // Dark Slate Blue
  doc.rect(0, 0, 210, 28, "F");

  doc.setFillColor(217, 119, 6); // Gold Accent Bar
  doc.rect(0, 28, 210, 3, "F");

  // Header Text
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("KARNATAKA STATE POLICE", 14, 15);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("CRIME AI INVESTIGATION & CASE DOSSIER", 14, 22);

  doc.setFontSize(9);
  doc.text(`CONFIDENTIAL - FOR OFFICIAL USE ONLY`, 130, 15);
  doc.text(`GEN DATE: ${new Date().toLocaleDateString("en-IN")}`, 130, 22);

  // Officer Line
  let y = 40;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`INVESTIGATING OFFICER:`, 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${data.officerName || "Dr. Alok Mohan, IPS"} (Badge: ${data.badgeNumber || "KSP-IG-001"}) - Tier: ${data.tier?.toUpperCase() || "IG"}`,
    70,
    y
  );

  y += 10;
  doc.setLineWidth(0.5);
  doc.setDrawColor(203, 213, 225);
  doc.line(14, y, 196, y);

  // Case Overview Box
  y += 8;
  doc.setFillColor(248, 250, 252);
  doc.rect(14, y, 182, 35, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, y, 182, 35, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`CASE ID: ${data.case_id}`, 18, y + 8);
  doc.text(`TITLE: ${data.title}`, 18, y + 16);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Crime Category: ${data.crime_type.toUpperCase()}`, 18, y + 25);
  doc.text(`Status: ${data.status.toUpperCase()}`, 100, y + 25);
  doc.text(`Filed Date: ${data.filed_date.slice(0, 10)}`, 18, y + 31);
  if (data.location) {
    doc.text(
      `Location: ${data.location.village_or_area}, ${data.location.district}`,
      100,
      y + 31
    );
  }

  // Modus Operandi (MO) Breakdown
  y += 45;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(217, 119, 6);
  doc.text("MODUS OPERANDI (MO) FEATURES", 14, y);

  y += 4;
  doc.setFillColor(254, 243, 199);
  doc.rect(14, y, 182, 22, "F");

  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Entry Method:", 18, y + 7);
  doc.setFont("helvetica", "normal");
  doc.text(data.mo_features?.entry_method || "N/A", 48, y + 7);

  doc.setFont("helvetica", "bold");
  doc.text("Time of Day:", 100, y + 7);
  doc.setFont("helvetica", "normal");
  doc.text(data.mo_features?.time_of_day || "N/A", 130, y + 7);

  doc.setFont("helvetica", "bold");
  doc.text("Weapon Used:", 18, y + 15);
  doc.setFont("helvetica", "normal");
  doc.text(data.mo_features?.weapon_type || "None", 48, y + 15);

  doc.setFont("helvetica", "bold");
  doc.text("Target Type:", 100, y + 15);
  doc.setFont("helvetica", "normal");
  doc.text(data.mo_features?.target_type || "N/A", 130, y + 15);

  // Case Narrative
  y += 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("INCIDENT NARRATIVE & EVIDENTIARY SUMMARY", 14, y);

  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const splitNarrative = doc.splitTextToSize(data.narrative, 180);
  doc.text(splitNarrative, 14, y);

  y += splitNarrative.length * 5 + 10;

  // Suspects if any
  if (data.suspects && data.suspects.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`LINKED SUSPECTS: ${data.suspects.join(", ")}`, 14, y);
    y += 10;
  }

  // Footer & Signature Block
  y = Math.max(y + 15, 240);
  doc.setDrawColor(203, 213, 225);
  doc.line(14, y, 196, y);

  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Generated via Karnataka State Police AI Orchestrator System (ZCQL / LangGraph Powered)",
    14,
    y
  );
  doc.text("Verification Seal: KSP-AUTH-VALIDATED-2026", 140, y);

  doc.save(`KSP_Report_${data.case_id}.pdf`);
}

export function generateQueryReportPdf(queryText: string, answerText: string, officerName?: string) {
  const doc = new jsPDF();

  // Header Bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 28, "F");

  doc.setFillColor(217, 119, 6);
  doc.rect(0, 28, 210, 3, "F");

  // Header Text
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("KARNATAKA STATE POLICE", 14, 15);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("CRIME AI ORCHESTRATOR SEARCH REPORT", 14, 22);
  doc.text(`DATE: ${new Date().toLocaleDateString("en-IN")}`, 140, 22);

  let y = 40;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("QUERY SUBMITTED:", 14, y);

  y += 6;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  const splitQuery = doc.splitTextToSize(`"${queryText}"`, 180);
  doc.text(splitQuery, 14, y);

  y += splitQuery.length * 5 + 8;
  doc.setDrawColor(203, 213, 225);
  doc.line(14, y, 196, y);

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("INTELLIGENCE ANALYSIS & ORCHESTRATOR ANSWER", 14, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const splitAnswer = doc.splitTextToSize(answerText, 180);
  doc.text(splitAnswer, 14, y);

  y += splitAnswer.length * 5 + 20;

  y = Math.max(y, 250);
  doc.setLineWidth(0.5);
  doc.setDrawColor(203, 213, 225);
  doc.line(14, y, 196, y);

  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Officer: ${officerName || "Dr. Alok Mohan, IPS"} | Karnataka State Police CCB Headquarters`,
    14,
    y
  );

  doc.save(`KSP_Query_Analysis_${Date.now()}.pdf`);
}
