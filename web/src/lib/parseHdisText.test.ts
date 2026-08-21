import { describe, it, expect } from 'vitest';
import { parseHdisText } from './parseHdisText';

// Exactly as pasted from the team's tracker sheet — headers block, then values
// block, including the stray blank line before "observations_by_Cofo" and the
// multi-line free-text observations log at the end (which the parser must not
// choke on, since none of the fields we care about come after it).
const SAMPLE = `ageing
req_status
priority_pm
priority_cm
priority_BIG
position_title
client_name
client_category
ARPD
position_confidence
confidence_predictor
jd_id
hiring_manager
hiring_category
new_requirement
job_req_date
selection_date
target_closure_date
position_went_on_hold
position_type
ppg_owner
partners_name
openings
projection_BIG
projection_PPG
projection_date
reason_for_projection_change_1
no_of_flags_received
location_type
Location
is_replacement
jd_google_link
blocker
escalation (if req going beyond 60 days)
screening_questions
screening_questions_link
sourcing_type
1+1_strategy
profiles_shared
duplicate_profile
actual_profile_shared
1st lot
1st Iteration
2nd lot
3rd lot
profile_selected_for_L1
profile_%_screen_select_L1
L0
L1_select
L2_select
L3_select
profile_offer_raised
profile_onboarded
last_updated
interview_rounds

observations_by_Cofo
business_loss_status
business_loss_responsible
27
Fulfilled by VAYUZ

NA
NA
Fullstack Developer
Gide Ai
C2
Low
Low
Low
GID_FUDE_20260622
Yashna Bansal
RAPYD (FTE)
Yes
Jun 22, 2026

August 3, 2026

Mid Level
Anshika Rana

2





Onsite
Gurgaon
No
[VAYUZ_JD_Fullstack Developer_2025060501 .docx](https://docs.google.com/document/d/1nn76ZGjnWWOukP4Ii76PeIE6PFia5np7/edit?usp=sharing&ouid=117608179300834446220&rtpof=true&sd=true)


YES
[Screening Questions.docx](https://docs.google.com/document/d/1INrt1DuYgKV8P8-PrCO4HrsA09bngiCv/edit?usp=sharing&ouid=109852881386905581954&rtpof=true&sd=true)
Fresh Sourcing
Yes









8
1
1
1
1
0

3
Aug 03 > 2 profile sent and 1 onborading
July 31 > Requireent will revise and let us know the budget
June 30> 2 profile added now 4 profiles are in pipeline and waiting for update`;

describe('parseHdisText', () => {
  it('extracts every app-relevant field from the tracker-sheet paste', () => {
    const { fields, matchedHeaderCount } = parseHdisText(SAMPLE);

    expect(matchedHeaderCount).toBe(58);
    expect(fields.jdId).toBe('GID_FUDE_20260622');
    expect(fields.title).toBe('Fullstack Developer');
    expect(fields.client).toBe('Gide Ai');
    expect(fields.reqDateISO).toBe('2026-06-22');
    expect(fields.openings).toBe(2);
    expect(fields.jdLink).toBe(
      'https://docs.google.com/document/d/1nn76ZGjnWWOukP4Ii76PeIE6PFia5np7/edit?usp=sharing&ouid=117608179300834446220&rtpof=true&sd=true',
    );
    expect(fields.owners).toEqual(['Anshika Rana']);
    // priority_BIG in this row is "NA" (unset) — ARPD/position_confidence/
    // confidence_predictor are the "Low" values a few columns later.
    expect(fields.priorityRaw).toBe('NA');
    expect(fields.priority).toBeUndefined();
  });

  it('reports how many columns were recognized and notes fields it filled', () => {
    const { notes } = parseHdisText(SAMPLE);
    expect(notes.some((n) => n.includes('Filled:'))).toBe(true);
    expect(notes.some((n) => n.includes('JD ID'))).toBe(true);
  });

  it('returns matchedHeaderCount 0 and a clear note for unrecognized text', () => {
    const { fields, matchedHeaderCount, notes } = parseHdisText('just some random notes');
    expect(matchedHeaderCount).toBe(0);
    expect(fields).toEqual({});
    expect(notes[0]).toMatch(/didn't recognize/i);
  });

  it('handles a partial paste (only the first few columns) without throwing', () => {
    const partial = `ageing
req_status
priority_pm
priority_cm
priority_BIG
position_title
client_name
27
Fulfilled by VAYUZ

NA
NA
Fullstack Developer
Gide Ai`;
    const { fields, matchedHeaderCount } = parseHdisText(partial);
    expect(matchedHeaderCount).toBe(7);
    expect(fields.title).toBe('Fullstack Developer');
    expect(fields.client).toBe('Gide Ai');
    // Columns beyond the pasted prefix (jd_id, job_req_date, openings, jd_google_link,
    // ppg_owner) simply aren't present in a 7-column partial paste.
    expect(fields.jdId).toBeUndefined();
    expect(fields.openings).toBeUndefined();
  });

  it('maps High/Medium/Low priority_BIG to P1/P2/P3', () => {
    // priority_BIG is the second "NA" in this run (priority_pm is blank,
    // priority_cm is the first "NA", priority_BIG is the second).
    const withHigh = SAMPLE.replace('NA\nNA\nFullstack Developer', 'NA\nHigh\nFullstack Developer');
    const { fields } = parseHdisText(withHigh);
    expect(fields.priorityRaw).toBe('High');
    expect(fields.priority).toBe('P1');
  });

  it('accepts a bare URL (not just a Markdown link) for the JD link column', () => {
    const bareUrl = SAMPLE.replace(
      '[VAYUZ_JD_Fullstack Developer_2025060501 .docx](https://docs.google.com/document/d/1nn76ZGjnWWOukP4Ii76PeIE6PFia5np7/edit?usp=sharing&ouid=117608179300834446220&rtpof=true&sd=true)',
      'https://docs.google.com/document/d/abc',
    );
    const { fields } = parseHdisText(bareUrl);
    expect(fields.jdLink).toBe('https://docs.google.com/document/d/abc');
  });
});
