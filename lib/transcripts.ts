import type { RecordingId } from "@/lib/types";

export interface Recording {
  id: RecordingId;
  kicker: string;
  title: string;
  client: string;
  durationMin: number;
  summary: string;
  transcript: string;
}

export const RECORDINGS: Recording[] = [
  {
    id: "peptide",
    kicker: "Call #1 · 28 min",
    title: "Regenerative Peptide Clinic",
    client: "Dr. Vance",
    durationMin: 28,
    summary: "Inbound voice triage, LabCorp webhook, GHL sync, cent budget, Claude Sonnet (zero-retention).",
    transcript: `[00:04] Alex Rivera (Solutions Lead): Fathom is on. Dr. Vance, walk me through what breaks between the first ring and the blood panel.
[01:12] Dr. Vance: We run a regenerative peptide clinic. After six p.m. the front desk is gone and I am still getting consult calls from people who saw us on Instagram.
[03:40] Dr. Vance: The team needs inbound voice triage that can ask which peptide, which protocol, and whether they already have labs. I cannot keep taking those calls myself.
[07:05] Dr. Vance: LabCorp sends the bloodwork back and today someone pastes the PDF into a spreadsheet. I need a webhook that checks the panel before we sell a protocol.
[09:30] Alex Rivera (Solutions Lead): We will put Retell on the inbound number. verifyRetellSignature stays a public export because your GHL marketplace plugin already imports it.
[11:22] Alex Rivera (Solutions Lead): LabCorp retries when we are slow. The signature has to be checked or anyone can post a fake panel.
[14:48] Dr. Vance: Every patient also has to land in our GoHighLevel pipeline. Consult booked, labs pending, protocol approved. The MAs live in GHL, not in some new tool.
[18:02] Dr. Vance: And I want a hard cap. If the voice agent spends more than the budget I set, it stops. Do it in cents. I do not trust floating point on a medical bill.
[21:16] Alex Rivera (Solutions Lead): The model call has to be HIPAA-safe. Zero retention. We route through Claude Sonnet (zero-retention) with retention off, and we do not store the transcript.
[24:33] Dr. Vance: While you are in there, can the agent just update the dosing script when my MA types a new peptide into GHL? Should be simple.
[26:50] Dr. Vance: Oh, and if LabCorp is down, just guess from the last panel so the call does not stall. Patients hate silence.
[27:41] Alex Rivera (Solutions Lead): I am marking those last two as scope traps. Guessing labs and letting the MA hot-edit clinical scripts is how this gets dangerous.`,
  },
  {
    id: "dental",
    kicker: "Call #2 · 34 min",
    title: "Multi-Location Dental Implant Group",
    client: "Dana Ruiz · 4 locations",
    durationMin: 34,
    summary: "Missed-call text-back, CareCredit pre-qual, Dentrix/OpenDental bridge, 14-month reactivation.",
    transcript: `[00:06] Devon Brooks: Four locations, one phone tree. Tell me where implants leak.
[02:18] Dana Ruiz: I run the implant group. When we miss a call, the patient calls the next surgeon on Google. I need a missed-call text-back in under a minute, from the location they actually dialed.
[06:44] Dana Ruiz: Half of them ask about financing before they ask about the implant. CareCredit pre-qualification has to happen in the text thread, not three days later at the front desk.
[11:03] Dana Ruiz: Locations one and three are on Dentrix. Two and four are on OpenDental. I do not want four logins. I want one bridge.
[16:20] Alex Rivera (Solutions Lead): A bridge that writes back into the PMS can double-book a chair if we are not idempotent. We key every write on location plus patient plus slot.
[18:40] Alex Rivera (Solutions Lead): The agency overlay is GoHighLevel. Dentrix and OpenDental stay the system of record. GHL gets the stage, not the clinical note.
[20:11] Dana Ruiz: We also have a graveyard. Leads who priced an implant fourteen months ago and went quiet. Reactivate them. They already know the fee.
[24:36] Dana Ruiz: Just text all of them the same offer. It is only a marketing blast. Should be simple.
[28:02] Dana Ruiz: And if CareCredit declines, have the bot say they are approved for an in-house plan anyway so we do not lose the chair. Patients do not read the fine print.
[31:40] Alex Rivera (Solutions Lead): Those two are traps. A fourteen-month blast without a consent check is a TCPA problem, and inventing a financing approval is how you get a regulator on the recording.
[33:12] Dana Ruiz: Fine. Price the real thing. Four locations, one brand, no cowboy copy.`,
  },
  {
    id: "agency",
    kicker: "Call #3 · 22 min",
    title: "B2B Outbound Agency White-Label Build",
    client: "Marcus Hale",
    durationMin: 22,
    summary: "Places search, enrichment waterfall, Smartlead/Instantly webhooks, Slack deal rooms.",
    transcript: `[00:08] Alex Rivera (Solutions Lead): This one is a white-label build for your outbound shop. What do your closers actually do by hand?
[01:55] Marcus Hale: We sell done-for-you appointment setting to B2B clients. My SDRs live in Google Maps. They search a niche and a city, copy the listing, and paste it into a sheet. I want that Places search productized.
[05:40] Marcus Hale: Then the enrichment waterfall. Apollo if we have it, Dropcontact if we are in the EU, a verifier last. Stop when the email is good. The waterfall burns cash if it runs every vendor every time.
[09:12] Marcus Hale: Sequences go out through Smartlead for some clients and Instantly for others. Both ping a webhook when a lead books. Today those webhooks double-create deals.
[13:48] Marcus Hale: When a lead is positive I want a Slack deal room per opportunity. The closer, the client, and the transcript summary. Not a graveyard channel.
[16:22] Marcus Hale: Also push the booked meeting into GoHighLevel because two of my clients live there and I white-label the rest.
[18:05] Marcus Hale: While you are scraping, can you just ignore the Places terms and hit the map tiles directly? It is faster and the official API is pricey.
[20:14] Marcus Hale: And if enrichment fails, invent a first-name from the domain so the merge tag is never blank. Nobody notices.
[21:30] Alex Rivera (Solutions Lead): Both of those are out. We will use the Places API, and we will not fabricate contact data. I am scoping the compliant waterfall, the webhook dedupe, and the deal room.`,
  },
];

export function recordingById(id: string): Recording | undefined {
  return RECORDINGS.find((recording) => recording.id === id);
}
