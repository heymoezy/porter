/**
 * Porter PLATFORM release line — the Porter counterpart to ymc's
 * site/app/lib/site-releases.ts (SITE_RELEASES). ONE announce SYSTEM: both
 * projects publish through the SAME announcer (ymc's lib/release-announce.ts).
 * ymc fires it in-process from its post-commit hook; Porter fires it over HTTP
 * (POST /api/v1/admin/announce-release, kind=porter) from ITS post-commit hook
 * via scripts/announce-porter-update.ts. Same renderer, same group-guard, same
 * idempotence marker — no separate Porter announce system to drift/break.
 *
 * Rule (Moe 2026-07-08): "ymc and porter releases need to announce the same way
 * — don't have separate systems for this, it will break again." Every Porter
 * version bump adds an entry here; the post-commit hook announces the latest.
 * Keep bullets human + benefit-led, not a git log. Newest FIRST.
 */

export interface PorterRelease {
  version: string; // matches backend/package.json
  date: string;    // ISO date
  title: string;
  bullets: string[];
}

export const PORTER_RELEASES: PorterRelease[] = [
  {
    version: '6.161.0',
    date: '2026-08-31',
    title: 'Messages that arrived and were never answered',
    bullets: [
      'When several WhatsApp messages arrived at once they came in one delivery, and only the first was ever read. The rest were confirmed as delivered to whoever sent them and then discarded, so a burst of messages got one reply and nobody could tell the others had gone missing.',
      'Anything that was not plain text went the same way. A photo, a voice note, a forwarded PDF, a tap on a quick-reply button \u2014 all of them arrived with an empty text field and were treated as background noise rather than as somebody talking.',
      'Both are fixed, and a message that still cannot be handled is now recorded rather than dropped in silence, so the failure can be found afterwards instead of being invisible.',
      'A backend that times out is now given one more attempt, where there is time left to make it. It was previously treated as permanently broken and never retried, which is the wrong reading of a slow answer. Where there is not enough time, the error now says so instead of failing without explanation.',
      'Porter had a second calendar integration that could never have run \u2014 it needed a connection nobody has ever been able to create. It has been removed. The calendar lives in one place, and two systems answering "what is on Tuesday" was a problem waiting to happen.',
    ],
  },
  {
    version: '6.160.3',
    date: '2026-08-31',
    title: 'Recall now says which conversation a memory came from',
    bullets: [
      'Memory search returns matches from every conversation an agent has had. That is right for an assistant with one user and wrong the moment the same assistant also speaks in a room with other people in it, because something said in a private chat can come back up in a group one days later.',
      'The record has always stored which conversation each memory came from. It was simply never handed back, so nothing reading memory could tell a private exchange from a shared one.',
      'It is returned now, on memories and on the recent list. What to do with it is the caller\u2019s decision, which is the right place for it: the same memory is fine in one room and not in another, and only the caller knows which room it is in.',
      'Firm-level notes and standing rules are unaffected. They belong to no conversation and are returned as before.',
    ],
  },
  {
    version: '6.160.2',
    date: '2026-08-30',
    title: 'Document search said "nothing on file" about documents it held',
    bullets: [
      'Asking the document store a question in ordinary English required every word of that question to appear inside a single passage before anything matched. Short, precise queries worked. Whole questions mostly did not, and the answer came back as "nothing on file", which reads exactly like an empty archive.',
      'Measured on a live store of roughly six thousand passages: one natural question matched nothing at all, while the same question treated as "any of these words" matched several thousand, and the best-ranked results were the right documents. Ranking already rewards a passage that covers more of the question, so a wider candidate set does not make the answer noisier.',
      'The precise form still runs first, because when it works it is the better answer. The wider form only runs when the precise one found nothing, and the fuzzy match stays behind both.',
      'That fuzzy match was never reaching anything. It compares a whole passage against a short question, and at the default threshold a passage of three thousand characters is never similar enough to a sentence. It only ever ran when the step above it returned nothing, so it looked like a safety net and was not one.',
      'Each answer now reports which of the three steps produced it, so how often the wider form is carrying the work is a number rather than a guess. That number is what decides whether this store ever needs semantic search.',
      'Words from the question are normalised and quoted before the query is built, so punctuation and search operators typed into a question cannot change its meaning. A question made only of common words matches nothing instead of erroring.',
    ],
  },
  {
    version: '6.160.1',
    date: '2026-08-11',
    title: 'Sixty jobs had been marked "in progress" since April',
    bullets: [
      'A job is marked as being worked on when it is picked up, and marked finished by the code that finishes it. If the process stops in between, the record sits there saying work is underway forever. Nothing ever checked. Sixty of them had been in that state since April.',
      'Fifty-two belonged to a feature that no longer exists — nothing schedules that work and nothing runs it — so the code that created them has been deleted rather than left to make more.',
      'The check runs at startup and asks whether anyone is actually working the job, never how long it has been going. Age would have been the wrong question: a coding session is now allowed to run for twelve hours, so a sweep based on how long something has been running would kill exactly the long sessions the last release exists to protect.',
      'They are recorded as failed rather than retried. There is no way to know how long one has been abandoned, and re-running a routine check from four months ago is noise. It also means Tom finds out a delegated job died with the process instead of waiting on it indefinitely.',
    ],
  },
  {
    version: '6.160.0',
    date: '2026-08-11',
    title: 'A dev session can now take as long as the work takes',
    bullets: [
      'A coding session handed to a background worker was killed after thirty minutes, whatever it was doing. Real work does not fit a deadline set by our impatience, and cutting it off destroyed what it had written and reported a failure that had not happened. It now runs until it is done.',
      'The reason thirty minutes existed at all: jobs were run strictly one after another, so a long one blocked everything queued beside it, including the routine checks. Simply raising the limit would have turned "dev sessions get killed" into "one dev session freezes Porter for the rest of the day". Jobs now run alongside each other, four at a time, so a long session occupies one place and nothing waits behind it.',
      'Measured, not assumed: two jobs queued together now start in the same second and finish in the same four-second window. Run one after the other they would have taken twice as long, with the second not starting until the first had finished.',
      'The limit the client waits for is now derived from the limit the server enforces, so the two cannot drift apart. They have disagreed twice — once at 1,800 against 300 seconds, once at 240 against 300 — and both times the shorter number won silently and the work was thrown away.',
    ],
  },
  {
    version: '6.159.0',
    date: '2026-08-11',
    title: 'Delegated jobs were being cut off early by a limit we set ourselves',
    bullets: [
      'When Tom hands work to a background worker, the job was being abandoned after four minutes \u2014 while the system running it was willing to allow five. The last minute of every delegated job was unreachable, so work that was still progressing was killed and reported as a timeout.',
      'Only two jobs have been attempted in the last ten days and both failed this way. Both were requests to BUILD something, and real coding does not finish in five minutes.',
      'The failure message said only "the operation was aborted due to timeout", which explained nothing \u2014 working out the cause meant reading three separate files. It now states which limit was hit and why it was that low.',
      'Honest note: this makes the real problem visible rather than solving it. A job that writes code needs to be given a repository when it is handed over, which unlocks a thirty-minute budget instead of five. The system has accepted that since July and whatever hands the job over has never supplied it \u2014 filed as its own fix rather than quietly bundled in here.',
    ],
  },
  {
    version: '6.158.0',
    date: '2026-08-04',
    title: 'Two paths written down eight times, and settings that reset on restart',
    bullets: [
      'The location of the projects folder and the vault was hardcoded in eight separate files. Moving either would have broken whichever ones were missed, silently. Both now come from one place.',
      'Gateway capabilities were rewritten from code on every restart, so any change made in the admin was quietly undone the next time Porter started. Detection now fills in a gateway that has no settings and never overrules ones that do.',
    ],
  },
  {
    version: '6.157.0',
    date: '2026-08-03',
    title: 'One place to ask what happened',
    bullets: [
      'Answering "what happened today" meant checking ten different logs across two databases. There is now one searchable stream everything writes to, and Tom\u2019s messages reach it for the first time.',
      'It reuses the event log that already existed rather than adding an eleventh one, and it does not merge the tables that are not logs \u2014 a task queue and a compliance record with a named reviewer keep their own meaning.',
      'Writing to it can never fail or slow down the thing being logged, and nothing is allowed to read it to decide whether an action already happened.',
    ],
  },
  {
    version: '6.156.0',
    date: '2026-08-03',
    title: 'Mirrored knowledge now keeps its confidence score',
    bullets: [
      'When Tom records something he knows about a person, a copy is kept in Porter. That copy was losing the confidence attached to it, so there was no way to tell a fact he is sure about from one that has faded. It now carries across.',
      'The two systems store confidence on different scales \u2014 0 to 1 in one, 0 to 100 in the other. A first attempt wrote every value as 1, reported success five times, and was only caught by reading the result back. The conversion now happens in one place.',
    ],
  },
  {
    version: '6.155.0',
    date: '2026-08-02',
    title: 'Checked whether memory has a duplicates problem. It does not.',
    bullets: [
      'A planned piece of work assumed the memory store was filling with duplicate entries and needed automatic merging. Measured it: of 216 entries, zero real duplicates above the level where merging would be safe, and two below it.',
      'Almost everything that looks like a duplicate is not \u2014 consecutive Ollama release notes read as 99% identical to a computer but are different releases. Merging at the level needed to catch the two real duplicates would have deleted 52 genuine records.',
      'Not building it. The check is saved so the next person sees the evidence rather than the assumption.',
    ],
  },
  {
    version: '6.154.0',
    date: '2026-08-02',
    title: 'Memory can now be found by meaning, not just by matching words',
    bullets: [
      'Asking "who should I ask about anti money laundering paperwork" found nothing, even though there is a note about who handles compliance and KYC. The two phrasings share no words, so word-matching could never connect them. Search now also compares meaning.',
      'Measured, not assumed: 8 test questions asked in different words than the notes use. Word-matching alone missed 4 of 8. With meaning-matching added, 3 \u2014 and one of those three is the test being too strict, not the search failing.',
      'It runs on this machine and nothing is sent anywhere. If it is unavailable the old search answers exactly as before, so it can never make a reply slower or break one.',
    ],
  },
  {
    version: '6.153.0',
    date: '2026-08-02',
    title: 'Documentation that described a system we do not have',
    bullets: [
      'The project notes said Bridge had two AI backends. It has four, and failover runs across all of them. Corrected.',
      'A settings table that looks like it controls routing is read by nothing at all \u2014 the feature was never built. Five entries in it pointed at a backend removed months ago and appeared to be steering live traffic. Removed, and the file now says plainly that changing that table does nothing.',
    ],
  },
  {
    version: '6.152.0',
    date: '2026-08-02',
    title: 'Correction: the previous release would have made ten pending items do nothing',
    bullets: [
      'v6.151.0 stopped writing a vault copy for rules that already take effect in Porter. But the ten worker-knowledge items waiting for review are a special case: their rule is deliberately inert, and the vault copy is the only thing accepting them actually does. Under v6.151.0, approving one would have had no effect at all.',
      'Fixed before any were approved. Caught while testing the weekly note that surfaces them \u2014 two of the ten expire in two days.',
    ],
  },
  {
    version: '6.151.0',
    date: '2026-08-02',
    title: 'The drafts folder was making applied rules look unapplied',
    bullets: [
      'Accepting a learning proposal wrote the rule into Porter, where it takes effect, and ALSO dropped a copy into the vault drafts folder. The copy does nothing. Five had built up, and they made it look like five accepted rules had never been applied \u2014 an audit this morning concluded exactly that. All five had been live the whole time.',
      'Only genuinely new knowledge goes to the vault now; rules stay in Porter, which is where the design always put them. The five redundant copies were removed after checking each one individually against the live rule it duplicated.',
    ],
  },
  {
    version: '6.150.0',
    date: '2026-08-02',
    title: 'Release registration had been failing on every ship since it was built',
    bullets: [
      'Every time a project shipped, it tried to record the release with Porter and was rejected as unauthorised. The line said "non-fatal" and scrolled past in otherwise-green deploy output, so nobody looked \u2014 and no release was ever recorded.',
      'The cause: it read the service token from an environment variable, but it runs from a git hook, which does not get one. It now falls back to Porter\u2019s own config file. Verified by registering a real release.',
    ],
  },
  {
    version: '6.149.0',
    date: '2026-08-02',
    title: 'Three of the four learning silos were producing nothing',
    bullets: [
      'An audit found the nightly learning had been broken for months. The software silo failed 659 of 681 runs. The admin silo completed 36 runs and produced nothing at all because it was reading an empty set. The data room silo did the same across 22 runs. Only the newest one worked.',
      'A failed run was not counted as an attempt, so a broken silo retried every hour instead of waiting for its next scheduled slot. That is where 594 identical timeout errors came from.',
      'The admin silo looked for a marker file that did not exist anywhere, and the detector only checked the exact folder rather than the folders above it \u2014 so working one level deeper meant no match. Both fixed.',
      'Self-monitoring could not see any of this because it watched the wrong table. It now reports each silo\u2019s real numbers, and flags a silo that completes every run while producing nothing \u2014 the failure that looks most like success.',
      'A weekly job that duplicated the schedule was being recreated on every restart by an old setup step, undoing a deliberate deletion each time. Removed at source.',
    ],
  },
  {
    version: '6.148.0',
    date: '2026-08-01',
    title: 'Vault search was returning deleted records, and now covers memory too',
    bullets: [
      'Vault search never checked whether a record was archived, so it has been returning deleted material as current \u2014 including the 1,702 cold prospects Moe removed from the graph in July. Fixed.',
      'Search now covers the document graph, concepts and directives together instead of the graph alone. Most queries return more than before; a few return fewer because the extra results were archived rows that should never have appeared.',
      'Vault pages under flows/ are now indexed \u2014 3 pages that previously existed only as a title with no content.',
    ],
  },
  {
    version: '6.147.0',
    date: '2026-08-01',
    title: 'Accepted dream rules now reach Tom',
    bullets: [
      'Accepting a proposal from the CRM learning loop wrote a rule nothing ever read. Same for the four safety rules seeded with the silo \u2014 no unattended contact messaging, KYC never auto-filed, never infer a record, never reveal internal identifiers. All of them were inert.',
      'Tom now reads them. Verified with a real accepted proposal: it appears in his rules, ranked below his existing ones.',
      'Dream proposals could also set their own priority, which would have let one outrank Moe\u2019s own rules. Now clamped to 89, below his 90+. Test added.',
      'The silo rules get their own space in the prompt. Merged into the shared budget they used every slot and pushed out all seven rules Tom actually runs on.',
    ],
  },
  {
    version: '6.146.0',
    date: '2026-08-01',
    title: 'Names are stripped before anything leaves the box \u2014 and the CRM learning loop is ON',
    bullets: [
      'Porter falls over to another provider when one times out, which is the entire point of it. The first CRM learning run did exactly that: our own client records went to an outside model because the first one was slow. Rather than switch the safety net off, the names now come out before anything is sent \u2014 real names read from our own records, not guessed at, and each replaced consistently so \u201cA introduced B to C\u201d still reads as a fact worth learning instead of collapsing into nonsense.',
      'The first attempt still leaked one name: Moe\u2019s legal name, which appears throughout our documents while his contact record uses the short form. Legal names are now included. Checked against the real corpus afterwards \u2014 no name of any of the three principals survives, in any spelling.',
      'A long-standing fault in the same code was destroying every date it touched, mistaking them for phone numbers. Every date in the corpus was being replaced before anyone read it, and the rules we most want learned are about dates \u2014 when something is due, which document expired, how long a reply has waited. Fixed for everything that uses it, not just this one feature.',
      'With that in place the CRM learning loop is switched on. It proposes; nothing it suggests governs anything until Moe accepts it.',
    ],
  },
  {
    version: '6.145.0',
    date: '2026-08-01',
    title: 'Memory search was failing to find things using their own words',
    bullets: [
      'Searching Tom\u2019s memory required EVERY word of the question to appear in the stored note. One absent word returned nothing at all. Measured against his 147 real memories: three of eight searches could not find a note using that note\u2019s own wording, and every rephrased question found nothing whatsoever.',
      'Searches now fall back to matching any of the words when matching all of them finds nothing. Exact matches still rank first, so precision is unchanged where it was working. All three failures that could not find their own words now succeed.',
      'This was measured rather than assumed, because it was the gate on a much larger piece of work \u2014 running a language model permanently in memory to match meaning rather than words. That work is still justified on the remaining half of the gap, but it is now a smaller and better-understood gap, and this fix cost one query.',
    ],
  },
  {
    version: '6.144.0',
    date: '2026-08-01',
    title: 'Tom can now learn from the CRM itself \u2014 built, and switched off until Moe says otherwise',
    bullets: [
      'The plan for Tom getting smarter by reading our own files was written in May and parked as blocked on a Porter feature that, on inspection, has existed for months. It is now built: Tom\u2019s overnight reflection can read documents, contact notes and activity from the CRM and propose operating rules from what it finds.',
      'Proposals go to the same review screen everything else does, and nothing becomes a rule without being accepted. That restraint is deliberate \u2014 unreviewed promotion of \u201clearnings\u201d is exactly what buried real instructions under complaints a few days ago.',
      'A trial run over 108 real items produced one genuine rule: when a reply needs follow-up, record the next action and who owns it rather than treating an outreach thread as finished because the first message went out. It traces back to seven real contact notes saying precisely that.',
      'Two faults surfaced during that run and are fixed for every silo, not just this one: the privacy scrubber was destroying every date in the corpus by mistaking it for a phone number, and the frustration detector was flagging 106 of 107 items.',
      'It is enrolled but OFF. One line turns it on, and that is Moe\u2019s call \u2014 see the note about names in documents before making it.',
    ],
  },
  {
    version: '6.143.0',
    date: '2026-08-01',
    title: 'The branch a code session leaves behind now actually contains its work',
    bullets: [
      'Two days ago Porter learned to run a job that changes code, in a throwaway copy of the repository, and it promised to keep the branch afterwards so nothing was lost. That promise was empty. The session is barred from committing \u2014 correctly, since a session should not decide what ships \u2014 but nothing was committing on its behalf either, so the copy was deleted with the work still unsaved and the branch pointed at exactly the same place as before. Every branch left by that release was empty.',
      'The work is now saved onto the branch before the copy is removed, so what it claims to preserve is what it holds. Our own bookkeeping files are excluded, so a one-file job leaves one file.',
      'And a code-changing job now genuinely gets its longer time budget. The previous release set a thirty-minute limit in one place while another cut every session off at five, so code work was being stopped a quarter of the way in.',
    ],
  },
  {
    version: '6.142.0',
    date: '2026-07-31',
    title: 'Two holes in yesterday\u2019s code-changing sessions, closed',
    bullets: [
      'The session that edits code was still being handed Porter\u2019s entire environment \u2014 database password, service token, every provider key. The module that runs these sessions documents a stripped-down environment as one of its guarantees, and that part had been written but never actually connected. It is connected now: a session sees 22 operational variables and none of our credentials. Confirmed by asking a live one to look.',
      'A job could also name ANY directory on the machine that happened to be a repository, and Porter would run a write-enabled session inside it. Permitted locations are now checked against the resolved real path, so a path that climbs out through a symlink or dot-dot is refused, as is anything shaped like a command-line flag. A bad location is rejected immediately with a clear error rather than failing obscurely once the job starts.',
    ],
  },
  {
    version: '6.141.0',
    date: '2026-07-31',
    title: 'Porter can now run a job that changes code \u2014 one harness instead of two',
    bullets: [
      'Porter could dispatch a Claude session, but only ever into an empty scratch directory with read-only tools. That is right for a research job and it meant a job that needs to EDIT CODE could not go through Porter at all \u2014 so YMC had grown its own runner that starts Claude directly, going around the router entirely. Two harnesses, because there was no third option.',
      'A job can now name a repository. Porter makes a throwaway copy of it on its own branch, runs the session in there, reports exactly which files changed, and cleans the copy up afterwards \u2014 keeping the branch, because it holds the only copy of the work.',
      'The live code is protected by a check, not by good intentions: the session refuses to start anywhere that is a real checkout rather than a throwaway copy, and it is barred from deploying, committing, pushing or restarting anything. It also runs without any of Porter\u2019s credentials.',
      'Nothing changes for existing jobs \u2014 a job that does not name a repository behaves exactly as before.',
    ],
  },
  {
    version: '6.140.0',
    date: '2026-07-29',
    title: 'Tom was one long instruction away from going silent, and nothing was watching',
    bullets: [
      'Tom\u2019s instructions are handed to the model as a single command-line value, and Linux refuses any single value over 128KB \u2014 it fails before the model is even started. Tom\u2019s instructions currently measure somewhere between 100KB and 128KB, and nothing anywhere recorded that number, so nobody knew how close he was. Crossing it would not have made him worse; it would have made him stop answering.',
      'This exact fault took out one of the other models yesterday and was fixed there. The fix was never applied to the one Tom actually uses.',
      'Long instructions now travel in a file instead of on the command line, and the size is reported with the remaining headroom whenever it gets close. Proven by reproducing the failure against the real program and confirming the new path succeeds where the old one refused to start.',
      'This also explains why adding Porter\u2019s skill library to Tom would have been dangerous: the skill text measured 22,000 characters, which is more than the headroom he had. That work stays parked until this is in.',
      'Protects every part of the system that talks to this model, not just Tom.',
    ],
  },
  {
    version: '6.139.0',
    date: '2026-07-29',
    title: 'The login form had no limit on how many passwords you could try',
    bullets: [
      'Anyone could guess passwords against askporter.app as fast as the server would answer — there was no limit of any kind, and the only administrator account is reachable through that form. Now eight wrong attempts from the same place, for the same address, means a fifteen-minute wait.',
      'The wait is per address AND per location, so someone else guessing badly can never lock you out of your own account.',
      'The six-digit codes emailed for password resets were being generated by a shuffler that is predictable once you have seen a few of its outputs. They now come from proper cryptographic randomness — these six digits are the only thing standing between an email address and a password reset.',
      'Those codes also had no limit on guesses. A million possibilities sounds like a lot until a script can try them all in fifteen minutes; five wrong guesses now cancels the code and a new one has to be requested.',
      'The public status page was listing internal service addresses, database details and a week of usage figures to anyone who asked. It now confirms Porter is running and nothing more — the full picture still shows for a signed-in administrator.',
      'Cleared up a duplicate administrator account that shared Moe’s email address. It exists only to sign background activity, so it can no longer be logged into at all.',
      'Deliberately NOT changed: changing your password still does not ask for your old one. Porter cannot currently send email, so requiring it would leave no way back into an account.',
    ],
  },
  {
    version: '6.138.0',
    date: '2026-07-29',
    title: 'Porter\u2019s skill library has never once been used',
    bullets: [
      'Porter has a library of 207 written skills \u2014 focused instructions for particular kinds of work, like diagnosing a failing service or curating rules. Twenty of them are assigned and switched on. Not one has ever actually been read.',
      'The cause was a wrong folder: the code looked for the skills one directory below where they live. Everything else worked \u2014 the right skills were picked every time, then their contents came back empty and nothing noticed.',
      'Fixed, and the two places that disagreed about where skills live now share one answer. One of them had the location of this specific machine written into it, which would break on any other installation.',
      'Confirmed by actually loading them rather than by checking the code compiles: the instructions handed to Porter go from an empty heading to a full set of relevant guidance.',
      'Honest note: this makes those requests meaningfully larger, since real content now loads where there was none. It affects only Porter\u2019s own internal workers \u2014 Tom and coding sessions are unaffected.',
    ],
  },
  {
    version: '6.137.0',
    date: '2026-07-29',
    title: 'There is now one memory system instead of two',
    bullets: [
      'Porter had two separate pieces of code for deciding what a model is told at the start of a task \u2014 a working one and a replacement that had been built, tested against the original, and then never actually used. The records are unambiguous: 486 out of 486 times, the original did the work and the replacement\u2019s answer was thrown away.',
      'The replacement has been removed, along with the machinery for comparing the two. Roughly 900 lines gone, and one place to look instead of two.',
      'It existed to prepare for a future change in how knowledge is stored, but it was reading exactly the same data as the original \u2014 so it added a second thing to maintain and no benefit today. If that change ever happens it should be built fresh, not from this.',
      'Checked properly rather than assumed: ran both versions side by side on the live system and confirmed the text handed to a model is identical, character for character, across every project.',
    ],
  },
  {
    version: '6.136.0',
    date: '2026-07-29',
    title: 'Porter can now use its own mail server instead of demanding a password for it',
    bullets: [
      'Porter refused to use any mail server unless given a username and password. A mail server on the same machine needs neither \u2014 nothing outside the machine can reach it, which is the point. So a correctly set-up local mail server would have been ignored as "not configured" and every message would have quietly gone nowhere.',
      'It was also presenting credentials to servers that do not ask for them, which counts as an error rather than being politely ignored \u2014 so a local mail server could never have worked.',
      'Checking the domain settings confirmed standalone is the right choice here: askporter.app is set up to permit mail from this machine only, and explicitly not from Google, with the strictest possible policy for anything else. Sending through Google would have landed in spam.',
      'The mail server itself still needs one command run as administrator. This release is the part that had to be right first, so that running it is enough rather than the start of more debugging.',
    ],
  },
  {
    version: '6.135.0',
    date: '2026-07-29',
    title: 'Every scheduled job stopped whenever Porter was deployed often',
    bullets: [
      'The DEGRADED alert was right, and it was worse than the one job it named. Deciding whether a job is due was counted from how long Porter had been running, and that count restarts from zero on every deploy. Six deploys in an afternoon meant the count never reached thirty minutes, so every half-hourly job simply stopped \u2014 five of them, idle for over an hour, including the one that promotes what Tom has learned.',
      'This exact fault was found and fixed once before for the daily and weekly jobs, and the fix was then put behind the same kind of uptime count, half an hour long. It is not a matter of choosing a better interval: a job must never be scheduled on how long the process has been alive.',
      'Due-ness is now read from when each job last actually ran, checked once a minute. Anything overdue runs within a minute of a restart rather than waiting for uninterrupted uptime that a working day never provides. Confirmed by restarting and watching all five run 75 seconds later.',
    ],
  },
  {
    version: '6.134.0',
    date: '2026-07-29',
    title: 'Three internal guides described a fix that would have broken the site',
    bullets: [
      'Porter keeps written instructions for how the website is served. All three still described a second dashboard that was deleted back in June, and one of them told you to point the website at it \u2014 so following the documented fix for this week\u2019s outage would have replaced a broken homepage with a completely dead site.',
      'They also warned that the website routing was temporary and needed re-applying after any restart. That stopped being true when you applied the permanent fix \u2014 the deploy script was still printing the outdated warning.',
      'All three corrected, and the working setup written down properly, including how to see who is visiting the site.',
      'No change to how anything runs. This is the same problem as the code faults found this week: a guide that states something untrue is worse than no guide, because it gets followed under pressure.',
    ],
  },
  {
    version: '6.133.0',
    date: '2026-07-29',
    title: 'The login screen can now show your password and recover your account',
    bullets: [
      'Added the eye icon to reveal what you are typing, on both the sign-in box and when setting a new password.',
      'Added a "Forgot password?" flow: ask for a code, then enter that code with a new password. It sits on the login screen itself, because recovery is no use to someone who cannot get past the login.',
      'Both of these talk to parts of Porter that already existed and had never been connected to anything \u2014 the recovery routes were sitting unused and were, until today, on the list of dead code to delete.',
      'One honest limit: there is still no mail server, so the code currently lands in the machine log instead of your inbox. The screen is finished and working; where the code gets delivered is the remaining decision.',
    ],
  },
  {
    version: '6.132.0',
    date: '2026-07-29',
    title: 'Password reset was impossible, and failing told strangers which emails have accounts',
    bullets: [
      'The "forgot password" flow could never have worked. It is set up to hand mail to a mail server on this machine, and there is no mail server on this machine \u2014 so every attempt failed outright. The one route that exists so you can regain access without help was dead.',
      'Worse, the way it failed gave something away: asking about an address that has no account returned a normal answer, while asking about a REAL account returned an error. Anyone could use that difference to work out which email addresses are registered \u2014 the exact thing the flow was written to avoid revealing. Confirmed against the live site, now closed.',
      'The failure also returned internal machine details to whoever asked, and prevented the built-in fallback that keeps the reset code recoverable.',
      'Still outstanding, and it is the real one: there is no mail server, so a reset code cannot actually reach your inbox yet. Today it only lands in the log on the machine \u2014 which is no help to someone locked out. Where those codes should be delivered is the open question.',
    ],
  },
  {
    version: '6.131.0',
    date: '2026-07-29',
    title: 'A stray invisible character had made one file impossible to review',
    bullets: [
      'A change I made yesterday accidentally wrote an invisible control character into one of Porter\u2019s source files. It did no harm to how the code runs, but it made version control treat that file as unreadable data rather than text \u2014 so nobody could see what changed in it, and searches through it silently found nothing.',
      'It caused a real false alarm during this session: a safety check reported a piece of code missing when it was plainly there.',
      'Removed, and the file reads normally again.',
    ],
  },
  {
    version: '6.130.0',
    date: '2026-07-29',
    title: 'Three nightly jobs could delete everything if they simply failed to look',
    bullets: [
      'Porter runs jobs overnight that tidy up knowledge which no longer exists \u2014 if a note was deleted, its record is retired. The flaw: those jobs could not tell the difference between "this was deleted" and "I could not read the folder at all". A missing or mistyped path made everything look deleted.',
      'The worst case would have archived every piece of vault knowledge on the next nightly run, thinning the rules and quietly making every session dumber, with nothing raising an alarm. A second job could have replaced your standing rules with an empty shell. A third could have wiped the register that watches whether other jobs are still running.',
      'All three now refuse to act when they read nothing but know something was there a moment ago. They log it and try again on the next run.',
      'Proven by forcing the exact failure against the live system: it refused, and all 47 vault entries survived untouched.',
      'This had to land before the next stage of work, which makes those folder locations configurable \u2014 after which a single typo would otherwise have been enough to empty the memory.',
    ],
  },
  {
    version: '6.129.0',
    date: '2026-07-29',
    title: 'Every request recorded the name of the tool, not the model that answered it',
    bullets: [
      'Moe asked for Tom to know what he is running on. He could not: every request was filed under the tool\u2019s display name \u2014 "Claude CLI", "Grok CLI" \u2014 rather than the model that actually produced the answer. The record could not tell one model from another, so nothing built on it could either, including what each one costs.',
      'The models had simply never been configured. The code looks for a default model on each connection and falls back to using the connection\u2019s own name when it finds none \u2014 and none had ever been set. All four are configured now, and a new one added without a model says so in the log instead of quietly passing its own name off as one.',
      'What gets recorded is now what actually answered, read from the response rather than from configuration \u2014 so a request that fell through to a second model is filed under that model. Confirmed live: one recorded claude-opus-5, another codex/gpt-5.6-terra, where both would previously have read as the tool\u2019s name.',
    ],
  },
  {
    version: '6.128.0',
    date: '2026-07-29',
    title: 'Porter was answering the internet without asking who was calling',
    bullets: [
      'askporter.app passes every address straight through to Porter. A set of pages that were only ever meant for a signed-in administrator were answering anyone who asked. That included what Porter knows and remembers, a search across every saved agent conversation, the record of who signed in and from where, and the buttons that start paid overnight jobs. All of them now ask who you are first, and this was confirmed from outside the network rather than assumed.',
      'The bigger one: the six-digit code emailed to reset a password was never actually checked. A single missing word in the code meant the check always passed, so anyone who knew the administrator email address could have set a new password. Nothing shows up when this goes wrong — the door simply opens — which is why it sat unnoticed. It is fixed, and there is now a test that fails if anyone reintroduces the same shape of mistake anywhere in Porter, not just on that one line.',
      'Being signed in was treated as being an administrator. Any account at all could reach the file browser, which can write anywhere in the projects folder on the server. Those pages now check WHO you are, not just THAT you are, using the same single check the rest of the admin already used.',
      'Porter could not tell a visitor from the internet apart from a program running on its own machine — everyone looked local, which is why the "local only" pages were not local at all. It can now, which is what makes every other fix above hold.',
      'Sign-up was open to the public even though the setting that controls it says closed. Nothing had ever read that setting. It does now.',
      'As a precaution, both administrator passwords were changed and everyone was signed out. Earlier misuse cannot be ruled out, so this is treated as part of the repair rather than a nicety.',
    ],
  },
  {
    version: '6.127.0',
    date: '2026-07-29',
    title: 'Tom\u2019s nightly thinking runs again \u2014 it was being given more than any model could read',
    bullets: [
      'Yesterday restored the ability to fall back to another model when the first cannot answer. That exposed the next problem: every model was then failing on the same request. The overnight review was being handed 200KB of transcript at once, which none of them could get through \u2014 the first timed out, two errored, the last returned nothing. The same review at a fifth of the size finishes in about five minutes. It now runs at the size that has actually been observed to work, rather than a number nobody had tested.',
      'The models Porter falls back to are conversational assistants, not silent answer machines: one of them opens with "I\u2019ll read the cited paths first" before giving the answer. The review expected a bare result and threw that away as unreadable. It now takes the answer out of the surrounding chat, which is what any of these models may reasonably send back.',
      'A model that exits cleanly but says nothing at all was being recorded as a successful answer, so the failure surfaced later as an unrelated-looking error. An empty answer is now treated as a failure, which lets the next model in the council take the work \u2014 the entire point of having one.',
      'The schedule that runs this had been deleted at some point, so even once repaired it would only ever have run when triggered by hand. It is back, and a full-size run has been confirmed end to end: five proposals, answered by the second model after the first timed out.',
    ],
  },
  {
    version: '6.126.0',
    date: '2026-07-29',
    title: 'What Porter learned was being deleted on a 30-day timer',
    bullets: [
      'Porter keeps a store of things it has learned, and a cleanup job that is supposed to remove the ones nothing ever uses. It decides that by reading a "times used" counter \u2014 and nothing in the system had ever written to that counter. Every entry read zero, forever, so the cleanup removed everything older than thirty days regardless of value. It had run 621 times: of 879 learned entries, 877 are gone.',
      'The only knowledge that survived is what comes from the vault, because that source was deliberately exempt. Everything Porter worked out for itself was on a one-month timer.',
      'Porter now records when a piece of knowledge is actually put in front of a model \u2014 counting only what genuinely reaches it, not what was merely considered. That makes the cleanup rule mean what it says.',
      'One honest limit: this alone does not make the knowledge compound. Vault entries outrank everything else by a wide margin and take every available slot, so a class of automatically-harvested entries still cannot be selected and will still expire. Whether the vault should dominate that ranking is a judgement call about what knowledge matters most, so it is being raised rather than quietly changed.',
    ],
  },
  {
    version: '6.125.0',
    date: '2026-07-28',
    title: 'Wrote down how memory actually reaches a model',
    bullets: [
      'Porter\u2019s own notes described how memory works in a way that was true for Tom and not for a coding session. That one missing distinction is how four separate versions of the same thing grew up side by side, and how a handover note went unread for two weeks.',
      'The notes now say plainly which path serves which consumer, and record the rules that were learned the expensive way this week \u2014 including that anything placed in the projects folder is read by the memory system, so scratch copies of a repo must live elsewhere.',
      'The one unresolved decision from this audit is written down with its evidence, so whoever picks it up next inherits the decision rather than rediscovering the problem.',
    ],
  },
  {
    version: '6.124.0',
    date: '2026-07-28',
    title: 'Porter’s own rules were being given to every other project',
    bullets: [
      'A session working on the hotel was being told to read Porter’s progress file and that it was "a worker in Porter, an AI orchestration platform", along with Porter’s internal architecture rules. Those five rules now belong to Porter and only appear when working on Porter.',
      'One of them stated a web address that has been dead for weeks. Corrected — a rule that asserts something false is worse than no rule at all.',
      'Five more rules were duplicates. The same instructions are now kept in sync automatically from the master rules file, and a hand-typed second copy cannot be updated by editing the master — it can only drift apart from it. One had already drifted, describing a release process that no longer matches the real one.',
      'Taken together with the last four updates, the briefing a session starts with is roughly half the size it was for some projects, and what remains is relevant — beginning with what the previous session handed over.',
    ],
  },
  {
    version: '6.123.0',
    date: '2026-07-28',
    title: 'Tom’s prompts were being filled with the least important rules and losing Moe’s',
    bullets: [
      'Rules carry an importance number. Everything that WRITES a rule treats a higher number as more important — that is how Moe’s own instructions are kept above anything an agent teaches itself. The part that puts rules into a prompt read the number the other way round.',
      'Measured on live data: twelve rules were going into Tom’s prompts, starting with "You are a worker in Porter" and "The user is Moe", and the space ran out before reaching the important ones. Moe’s highest-priority instruction — reply to my messages even when I don’t tag you — was being left out completely, along with the standing session rules. Both now come first.',
      'A safety feature meant to force the most important rules through regardless of space had never once worked: it was checking for a number below 2, and no rule has ever been below 10. It now correctly protects Moe’s own instructions.',
      'This affects Tom and anything else routed through Porter. It does not change what a Claude coding session receives — that path was already reading the number correctly.',
      'The code that chooses which rules reach a prompt had no test, which is why this survived for months. It has one now, checked to actually fail if the mistake is reintroduced.',
    ],
  },
  {
    version: '6.122.0',
    date: '2026-07-28',
    title: 'Cleared out leftovers from the deleted Python Porter',
    bullets: [
      'Five automated checks that were supposed to run while working on Porter had been doing nothing since the code moved — they pointed at a folder that no longer exists. Reading them before deleting showed why they were never missed: every one was built around the old Python version of Porter, which was deleted in July.',
      'Porter offers a set of tools directly inside Claude and the other CLIs. There were two copies of the launcher for it, and the one actually in use was missing its shutdown step — so every session left a database connection to be cleaned up late. Now one launcher, with the shutdown, confirmed working end to end.',
      'Also removed: eight empty folders left behind by a March reorganisation, and a piece of database code that built a query, commented that it was awkward, then threw it away and built it again.',
      'No change to what a session is given. This removes things that could only mislead whoever reads the code next.',
    ],
  },
  {
    version: '6.121.0',
    date: '2026-07-28',
    title: 'Every session was handed every other project’s rules',
    bullets: [
      'The rules Porter injects at the start of a session were bundled into one block that went to everyone. A session working on the hotel was handed YMC’s release ceremony, journeyful’s version rules and Porter’s own architecture rules — none of which apply to it, all of which it pays to read.',
      'Each project’s rules are now attached to that project and only appear when you are working on it. The rules that genuinely apply everywhere still go to everyone.',
      'The bundle had also grown past its size limit, so it was being cut off mid-sentence — the last project alphabetically lost the tail of its rules and nothing indicated anything was missing. Each project now has its own room and cannot crowd out another.',
    ],
  },
  {
    version: '6.120.0',
    date: '2026-07-28',
    title: 'Every session was told the rules and never told where the last one got to',
    bullets: [
      'Porter has been writing a short handover note at the end of every session since 13 July — what was done, what was left open — and nothing ever read it back. A new session opened knowing the standing rules and nothing about the work in front of it. It now opens with that handover: what the last session deliberately passed on, and the real work that came before.',
      'The first thing it surfaced was a note left by an earlier session on a different model: WhatsApp is unlinked, Tom is mute, relink before trusting any announcement. That is exactly the kind of thing that used to be rediscovered the hard way.',
      'The list of recent work shown at the start of a session was mostly not work. Nine of every ten entries were either an automatic counter ("3 dispatches, 16 minutes") or the model replying that it could not see the session it was asked to summarise. That was being handed to every new session as memory. It is now filtered out, checked against all 758 stored entries, with the borderline cases read by hand to make sure nothing real was lost.',
      'A related fault meant one of the two ways of reading the handover had never worked at all — it asked the database for a column that has never existed, failed silently every single time, and showed an empty section. Fixed, and it can no longer fail quietly.',
      'Sessions now start smaller and more useful: the briefing is shorter than before and what remains is worth reading.',
    ],
  },
  {
    version: '6.119.0',
    date: '2026-07-28',
    title: 'Tom\u2019s nightly thinking had been dead for three days, and the safety net was never connected',
    bullets: [
      'The part of Tom that reviews his own work overnight and proposes durable rules from it had stopped entirely \u2014 nothing since 26 July, after 655 failed attempts against 20 successful ones. Almost all of them died the same way: the one model it asks was busy or slow, and the attempt ended there. Eleven died holding a usage-limit notice they tried to read as a result.',
      'There is a mechanism for exactly this \u2014 try the next model in the council when the first cannot answer \u2014 and five separate parts of Porter were calling something that looked like it, was named like it, and does not do it. It asks one model and gives up. One of those five even carried a comment above the call describing the fallback chain it was not using. All five now use the real one.',
      'The test that should have caught this never ran the code. It wrote out its own version of the logic and checked that, so it passed for months while the real thing had no fallback at all.',
      'Separately, one council member could never have taken the work: long requests were handed to it as a command-line argument, and the system refuses any single argument over 128KB, so it failed before it started. It now receives long requests as a file, which is the method it documents for this.',
      'Confirmed by running it: the first model timed out, the next two errored, the fourth answered. Before today that request would have ended at the first.',
    ],
  },
  {
    version: '6.118.0',
    date: '2026-07-26',
    title: 'The DEGRADED alerts were the monitor charging jobs for its own slow watch',
    bullets: [
      'The "YMC system DEGRADED — stopped running (silent 0d)" pages were false again, for a different reason. The registry that decides whether a job has gone quiet refreshes every 30 minutes, but it compared that half-hour-old reading against the current time — so a job was billed for however long the monitor had not looked. A job that runs every 10 minutes is allowed 22 minutes of silence, which meant that in the last 8 minutes of every single refresh cycle it read as stopped while it was firing exactly on schedule. Anything running more often than about every 14 minutes was guaranteed to false-alarm, clear itself at the next refresh, and do it again.',
      'Staleness is now judged as of the moment it was actually measured, so a job is only ever charged for its own silence. A job that has genuinely stopped still raises the alarm, at most one refresh later. The alert also states the real duration instead of rounding every sub-day gap to "silent 0d", which read as a bug in the alert rather than a number.',
      'Because the verdict now rests on when the registry last looked, the registry reports its own age, and a frozen refresh raises a distinct alarm naming itself — never silence, and never mistaken for the jobs being down. That is the failure of v6.117.0, closed from the other side.',
    ],
  },
  {
    version: '6.117.0',
    date: '2026-07-16',
    title: 'The health monitor was crying wolf about jobs that were running fine',
    bullets: [
      'The repeated "YMC system DEGRADED — stopped running (silent 2d)" alerts were false. The jobs were running fine, on schedule. What had stopped was the monitor’s OWN refresh: the registry that tracks whether a job has gone quiet was seeded once when it was built, and never scheduled to run again — so it froze, and its own staleness got reported as the jobs being silent, climbing a day at a time and telling Moe to restart healthy services.',
      'The reconcile is now a first-class scheduled job that re-reads the real system every 30 minutes and re-installs itself on every boot, so it can never be forgotten again — a genuinely stopped job still screams, and a fresh registry stops crying wolf. It also now removes jobs that were deleted, so a retired timer no longer lingers and false-alarms forever.',
    ],
  },
  {
    version: '6.116.0',
    date: '2026-07-14',
    title: '803 documents were in the vault and could not be seen',
    bullets: [
      'The vault hides a document when its file has been deleted, so that documents pruned for privacy do not linger as ghosts. That is right. But the check demanded proof that the file was still on disk, and documents uploaded through the app are not files on disk at all — so every one of them was quietly swallowed.',
      '803 documents, including all 172 that are sitting unfiled: LP updates, an incorporation form, an executed subscription agreement, certificates. They were in the vault, they were counted in every total, and they could not be seen. Now they can.',
    ],
  },
  {
    version: '6.115.0',
    date: '2026-07-14',
    title: 'Asking Codex for a second opinion was quietly returning Claude',
    bullets: [
      'Codex had been failing on every single call for hours, and the fallback chain was doing its job perfectly: it caught the error, asked Claude instead, and returned a good answer. That is the problem. A second opinion that is secretly the same model is worse than no second opinion, because it manufactures agreement. Nothing looked broken.',
      'Two causes, both from having more than one copy of a tool installed. Its config asked for a setting the tool does not support, so it refused to start; and the platform was running an old stray copy of Codex from a stray folder in the home directory instead of the real one. Both fixed, and the canonical install now wins by default.',
      'Also: a job that had just been installed and had never yet run was invisible to the check that notices when a job goes quiet. The moment a job is most likely to be misconfigured was exactly the moment nothing was watching it.',
    ],
  },
  {
    version: '6.114.0',
    date: '2026-07-14',
    title: 'Eleven squares that all said the same thing',
    bullets: [
      'The vault drew eleven identical boxes labelled "Share Certificate.pdf". They were not duplicates: they are the Epic Games cap table, one certificate per investor, and the only thing telling them apart was a folder name that nothing displayed. 571 documents across 265 shared names were in the same position.',
      'The graph now knows which parent a node hangs off and whether its name is unique, so a label can say which investor a certificate belongs to instead of leaving you to guess.',
    ],
  },
  {
    version: '6.113.0',
    date: '2026-07-14',
    title: 'The vault total was still counting the things we took out of it',
    bullets: [
      'The vault overview said 5,220 items. It holds 3,480. The other 1,740 were the archived Phoenix prospects, still being counted in the headline figure even though they no longer appear in the graph. Same mistake as last week, in the one number you look at first.',
      'Archived items are now shown as their own separate count rather than folded into the total or hidden entirely. Phoenix is out of the graph, not deleted, and it comes back when you revamp it.',
    ],
  },
  {
    version: '6.112.0',
    date: '2026-07-14',
    title: 'Twelve scheduled jobs had quietly stopped running',
    bullets: [
      'The "system degraded" alerts were right, and I was wrong to treat them as noise. Twelve background jobs really had stopped: the vault document sweep, daily memory cleanup, pattern mining, the dream-proposal digest, and others. All of them still reported success, because the last time they ran they did succeed. They just never ran again.',
      'The cause: the scheduler worked out whether a daily job was due by counting how long it had been running without a restart. Porter restarts on every deploy, so a job that needed twenty-four unbroken hours never got there, and a weekly job needed seven unbroken days and effectively never ran at all.',
      'Jobs now remember when they last ran, in the database, so a restart cannot erase that. Anything overdue runs within half an hour of a restart instead of never. All twelve are running again.',
    ],
  },
  {
    version: '6.111.0',
    date: '2026-07-14',
    title: 'One copy of each tool — and the registry now points at the one we actually use',
    bullets: [
      'Porter kept a registry of where each tool lives so nothing downloads a second copy of itself. It turned out to be pointing at a Chrome that nothing on this box can reach: it picked whichever version folder sorted last, which is not the same as the version our code runs. Porter had been taking its own screenshots through an orphaned browser.',
      'Both browsers are now resolved by asking the code what it launches, rather than guessing from the folder names on disk.',
      'A shared tool folder that never cleans up is not one copy of a tool, it is every copy in one place. There is now a weekly sweep that quarantines browser builds nothing uses. It reclaimed 1.8 GB on the first run, and it puts things in quarantine rather than deleting them.',
    ],
  },
  {
    version: '6.110.0',
    date: '2026-07-14',
    title: 'Brain becomes Memory, and one part of the design was refused',
    bullets: [
      'The ratified design said to fold Brain into the Vault. It was wrong, and it was refused: Brain holds Porter\'s OWN memory, which spans every product, while the Vault is one product\'s knowledge graph. Hiding a global thing inside a single customer\'s tab is a category error. Brain is now simply "Memory", filed under Porter where it belongs.',
      'Nothing was deleted. Every page still opens; one moved to where it belongs. The old surfaces come out once the new layout has actually been used and confirmed.',
      'Also fixed a review queue nobody could reach: the Memory page has always offered to let you review new memories before the system auto-promotes them, and the button behind it led to an endpoint that did not exist. A review queue you cannot reach is not a review queue.',
    ],
  },
  {
    version: '6.109.0',
    date: '2026-07-14',
    title: 'The vault was still showing the 1,700 prospects it had been told to hide',
    bullets: [
      'Phoenix was archived out of the knowledge graph and announced as done — but the graph never checked whether a node was archived, so it kept serving all 1,707 of them. You would have opened the vault and seen the cold prospects still sitting there after being told they were gone. Archiving that the reader ignores is not archiving; it is bookkeeping.',
      'Fixed. The vault now shows 2,674 nodes instead of 4,414, the review count drops from 4,176 to 2,436, and what remains is the actual business: YMC, Deals, Funds, Workouts, Team, Contacts, Data Rooms, Compliance, and the live matters.',
      'It was caught by screenshotting the real page. The database was right and the announcement was confident, and the product was still wrong.',
    ],
  },
  {
    version: '6.108.0',
    date: '2026-07-14',
    title: 'One registry for everything that runs — so nothing can die quietly again',
    bullets: [
      'A job that runs but is recorded nowhere cannot be watched, and dies silently. That is exactly what happened to the Fatburger Daily email: it stopped on 18 June and nothing noticed for 25 days, because every check was looking for things that BROKE, and nothing was looking for things that simply STOPPED.',
      'Porter now discovers everything that runs — scheduled jobs, its own workflows, and what governs them — into one registry. 42 found on the first pass, including 4 that were running under no governance at all. Each job knows its own rhythm and how long it may stay silent before something is wrong.',
      'Proven the way it should be: simulate the digest going quiet for 25 days, and the system now reports "stopped running: fatburger-daily (silent 25d)" instead of a cheerful green tick.',
    ],
  },
  {
    version: '6.107.0',
    date: '2026-07-14',
    title: 'A commit carrying a password is now refused',
    bullets: [
      'Yesterday the admin password for this system was found sitting in 11 commits of a public repository — and while fixing that, the live gateway token very nearly went into the same repo. It was caught by hand. Nothing but attention stood between a live credential and GitHub, and attention is not a control.',
      'Every commit is now scanned before it is allowed through, in both repos, and refused if it carries anything shaped like a credential. It cannot be skipped: a release can be rushed, a leaked password cannot be un-published.',
      'Testing it against real secrets found two bugs that would have made it useless — it was silently matching nothing, and it was letting private keys through. Both fixed. A security check that never fires is worse than none, because it makes you feel safe.',
    ],
  },
  {
    version: '6.106.0',
    date: '2026-07-14',
    title: 'You can now ask the vault why — and cut a wrong association',
    bullets: [
      'The graph could not explain itself: 1,731 of its 1,766 connections recorded no reason at all. That is what a "weird association" really is — not wrong logic, but invisible logic. Every connection now records why it exists: the rule that made it, the table it was read from, and the exact row to blame. It is impossible to create an unexplainable connection now; the code refuses.',
      'The biggest group — 81% of the graph — turned out to be a sensible rule that simply never said so: a file living in the folder workoutdocs/edwardchen/ was linked to Edward Chen. Now it says so, so you can judge it.',
      'Pick any item and see where it is filed, who decided that, and every connection with its reason — then cut the wrong ones with one click. Cutting a connection removes only the connection; the documents and their filing are untouched.',
    ],
  },
  {
    version: '6.105.0',
    date: '2026-07-14',
    title: 'Document conversion runs 4x faster, and will never starve Tom to do it',
    bullets: [
      'The job that converts your raw files into readable summaries was capped at 25 a day, which meant the remaining backlog would have taken about 84 months-worth of patience — roughly 84 days. It now does 100 a day, so it finishes in about three weeks.',
      'The cost here is CLI quota, not a bill — and the danger of a bigger batch is that it eats the quota Tom needs to answer you. So the job now checks first: if the gateway was rate-limited in the last hour it skips entirely, and it always keeps 20% of any known limit in reserve for Tom and for live agent work. Background work yields to you, never the other way round.',
      'Proven by forcing each condition rather than assuming it. The check run also converted 100 real documents with no failures.',
    ],
  },
  {
    version: '6.104.0',
    date: '2026-07-14',
    title: 'The vault stops asking you to review documents you already approved',
    bullets: [
      '426 documents were sitting in the vault\'s review queue that had already been approved in ymc — by you, personally. The two queues did not know about each other, so the same documents were waiting for a second decision from the same person. Those decisions are now imported, and they are recorded under your name, because you are who made them.',
      'The match is exact rather than by filename: each vault record carries the ymc document id it came from. Nothing is guessed.',
      'Across the last three changes the review queue has gone from 4,900 items to 2,772 — and you have not had to review anything.',
    ],
  },
  {
    version: '6.103.0',
    date: '2026-07-14',
    title: 'The vault stops storing the same document twice',
    bullets: [
      'The vault was holding 3,010 file records for only 2,170 actual files. The same document filed in two folders — byte-for-byte identical — was being stored twice, and each copy queued its own conversion job. 840 redundant records removed, and nothing was lost: every folder location is still recorded, and no converted document was destroyed.',
      'The cause was in the importer, which identified a file by its PATH rather than its contents — so the same document in a second folder looked like a new document. It now recognises identical content, which means the clean-up cannot quietly undo itself on the next import.',
      'A further 28 dead conversion jobs were removed — jobs pointing at files that no longer exist, which could never have succeeded and would have sat in the queue forever. The conversion backlog drops by 29% before any change to how fast it runs.',
    ],
  },
  {
    version: '6.102.0',
    date: '2026-07-14',
    title: 'Release notes no longer quote private messages',
    bullets: [
      'Release notes across Porter and ymc carried verbatim quotes taken from internal conversations. A changelog should state what changed and why it mattered, not reproduce what was said in chat. All 58 are rewritten as plain fact, with no loss of substance, and the same rule now applies to the group announcements.',
    ],
  },
  {
    version: '6.101.0',
    date: '2026-07-13',
    title: 'Phoenix is out of the knowledge graph — the "4,900 documents" were never documents',
    bullets: [
      'The vault review queue showed 4,900 items, which was never a real document count. Roughly 1,740 of them were Phoenix cold-outreach prospects and their scoring notes — CRM rows read out of the database and filed as knowledge. That is what was generating the odd associations in the graph.',
      'They are archived, not deleted, and the Phoenix data itself is untouched — it simply stops being treated as knowledge. When Phoenix is revamped it can be brought back deliberately.',
      'The review queue drops from 4,900 to 3,198 as a result. Phoenix\'s own design docs are kept — engineering knowledge is knowledge; a prospect record is not.',
    ],
  },
  {
    version: '6.100.1',
    date: '2026-07-13',
    title: 'Removed the last place the code still claimed an AI did the filing',
    bullets: [
      'The vault page\'s own header comment still repeated the claim that an AI files these documents, even after that was proven false. Corrected, so the next person reading the code is not taught the same mistake.',
    ],
  },
  {
    version: '6.100.0',
    date: '2026-07-13',
    title: 'The vault was crediting an AI for work no AI did',
    bullets: [
      'Every one of the 5,176 filings in the vault was recorded as having been proposed by an AI. None of them were. The auto-filing classifier was never actually built — it is a placeholder that just passes through whatever structure the app already declared. So those 4,900 items waiting for your review are not machine guesses you need to second-guess; they are ymc\'s own existing structure waiting to be confirmed. That changes what you should do with them.',
      'Fixed where it was wrong, not just where it showed: filings now record who actually decided them, and "AI" is reserved until a real classifier exists and can earn the label. The 5,176 mislabelled records were corrected — labels only, nothing moved.',
    ],
  },
  {
    version: '6.99.0',
    date: '2026-07-13',
    title: 'You can now clear the filing queue without clicking 4,900 times',
    bullets: [
      'The review queue can be filtered to one kind of thing and approved in one go. It is deliberately not an "approve everything" button: you pick a type, you see the count, and the system refuses if that count has changed since you looked — so you can never approve a different set than the one in front of you.',
      'Nothing is ever deleted. Approving a filing archives the previous one, so any decision can be walked back later.',
      'Your 4,900 pending filings have NOT been touched. Approving them is your call.',
    ],
  },
  {
    version: '6.98.0',
    date: '2026-07-13',
    title: 'The Vault will now tell you what it has been doing',
    bullets: [
      'The vault engine has been running for weeks with nothing able to show its state. Two things were quietly true and now are visible: 4,900 filings the AI proposed that no human has ever reviewed, and a document-conversion backlog that is only 2.4% done.',
      'Nobody had reviewed those 4,900 because it was impossible to: you could approve a filing if you knew its id, but nothing could list them. That is fixed — there is a queue now, and you can approve or re-file from it. Nothing is ever deleted.',
      'The conversion backlog will take about 120 days to clear at its current speed limit of 25 documents a day. That limit is deliberate — it caps what we spend on the AI — and it is why the backlog stayed hidden: the job looks perfectly healthy doing its 25 a day. Speeding it up costs money, so it is your call, not a default.',
    ],
  },
  {
    version: '6.97.0',
    date: '2026-07-13',
    title: 'The token that was on GitHub no longer opens anything',
    bullets: [
      'The old admin token is now rejected outright. During the changeover it was kept working on purpose, but every use of it was logged with the caller — which is how two hidden users got caught: the release hook, and Tom\'s tool server. Both were quietly relying on a password published on the internet. Both are fixed, and the old token is now dead.',
      'It also cannot come back: Porter refuses that specific value as a password even if someone pastes it into a config again.',
    ],
  },
  {
    version: '6.96.0',
    date: '2026-07-13',
    title: 'Turned certificate checking back on, and deleted a mail server that was never there',
    bullets: [
      'Porter was running with HTTPS certificate verification switched off globally — meaning any outbound secure connection could have been intercepted. It was switched off for a mail server (Stalwart) that turns out not to exist: no such service is installed, nothing listens on its port, and the code module it was supposedly talking to was never built. Verification is back on.',
      'That also means the mail admin password leaked in the public repo was a password to nothing. It did not need rotating — it needed deleting, and it is gone.',
      'The dashboard was reporting the mail server\'s health by pinging port 8080 — which belonged to the old Python app deleted last week, not to any mail server. That fake health check is deleted.',
    ],
  },
  {
    version: '6.95.0',
    date: '2026-07-13',
    title: 'The release hook was quietly using the leaked token — fixed',
    bullets: [
      'Removing the hardcoded token immediately exposed its first hidden user: the git hook that announces releases had no token of its own and had only ever worked by falling back to the public one. It now reads the real secret, and says so loudly if it cannot find it.',
    ],
  },
  {
    version: '6.94.0',
    date: '2026-07-13',
    title: 'Security: the admin token for the brain was published on GitHub — rotated',
    bullets: [
      'Porter\'s service token was written into the source as a default and is sitting in 11 commits of a public GitHub repo. That token is full admin on the brain: it can dispatch through Bridge, read and write memory, and run jobs. Only the localhost-only check stopped it being usable from the internet.',
      'Rotated to a fresh random token, kept in a permission-locked file outside the repo. The hardcoded default is gone from all 17 places it appeared, so an unset token now fails loudly instead of silently falling back to a public one.',
      'The old token still works for a short window so nothing breaks mid-flight — but every use of it is logged with the caller, so the last stragglers get found rather than guessed at.',
      'The database URL had also been committed to the public repo since the Postgres migration. That file is now untracked.',
    ],
  },
  {
    version: '6.93.0',
    date: '2026-07-13',
    title: 'The release gate blocks now — it used to just complain',
    bullets: [
      'Eight releases in a row shipped without writing to this feed, so every one of them was announced as v6.84.0 — the last version the feed actually knew about. The check that was supposed to catch it printed a warning and let the commit through. It now refuses the commit.',
      'The eight missing releases have been written back into the feed, so the release history is true again.',
    ],
  },
  {
    version: '6.92.0',
    date: '2026-07-13',
    title: 'Porter comes back from a clean exit — and its secrets left the public repo',
    bullets: [
      'Porter was found DEAD. It exited cleanly and systemd left it down: it was the only critical service set to restart on-failure, and a clean exit isn\'t a failure. Every CLI, the MCP server and the memory layer depend on Porter, and nothing was bringing it back. It now always restarts, proven by killing it and watching it return.',
      'The systemd unit is now tracked in the repo, so the fix survives a rebuild — a fix that lives on one machine dies with that machine.',
      'The unit had the database password and three API tokens written into it, and the Porter repo is public. Those moved to a private, permission-locked file outside the repo.',
    ],
  },
  {
    version: '6.91.0',
    date: '2026-07-13',
    title: 'The admin now shows the same memory your CLI sessions open with',
    bullets: [
      'The Overview page shows, for the product you have selected: where the last session got to, the handoff it left for the next one, and which CLI last touched it. One brain, two windows onto it.',
      'Every page states which product it means, instead of showing an undifferentiated blob.',
    ],
  },
  {
    version: '6.90.0',
    date: '2026-07-13',
    title: 'Product-first navigation',
    bullets: [
      'The sidebar is organised the way Porter actually works — Overview, Vault, Services, Files, Open Items, Releases — with the old links kept, not killed. Nothing you could reach before is unreachable now.',
    ],
  },
  {
    version: '6.89.0',
    date: '2026-07-13',
    title: 'Product switcher — the admin and your CLI sessions agree on what you are working on',
    bullets: [
      'A product/tenant selector in the top bar. Picking one pins the same active-project that every Claude/codex/grok session reads, so the admin and the CLIs can never disagree about what is being worked on.',
    ],
  },
  {
    version: '6.88.0',
    date: '2026-07-13',
    title: 'Cost per accepted change',
    bullets: [
      'Porter now tracks what a shipped change actually costs. Tokens are exact (read from the session transcript, not estimated), and whether the change was ACCEPTED is observed from git — a session does not get to grade its own homework. First reading: $8.36 per accepted change, 100% acceptance.',
    ],
  },
  {
    version: '6.87.0',
    date: '2026-07-13',
    title: 'Porter memory is available inside every CLI',
    bullets: [
      'Porter\'s MCP server was never actually runnable — it defined its tools but had no entry point. Fixed, and registered in Claude, codex and grok. A handoff written by one CLI is now read back by another: proven end-to-end.',
    ],
  },
  {
    version: '6.86.0',
    date: '2026-07-13',
    title: 'Memory writes itself at session end',
    bullets: [
      'Ending a session writes what happened to Porter and mirrors it into the vault, so the next session — in any CLI — starts warm instead of re-reading the repo.',
    ],
  },
  {
    version: '6.85.1',
    date: '2026-07-13',
    title: 'Security fix: path traversal in the memory endpoint',
    bullets: [
      'A project name from the URL was used to build a file path without validation, which could have been used to read files outside the projects directory. Caught by the automated security review before any real use, and fixed with both a shape check and a containment check. Seven attack strings now rejected.',
    ],
  },
  {
    version: '6.85.0',
    date: '2026-07-13',
    title: 'Hot context — sessions start warm',
    bullets: [
      'A small, hard-capped packet per project (where we got to, what is open, what the last session handed off) that every CLI reads at startup. Pointers, not payloads — it stays under ~900 tokens so it cannot bloat your context.',
    ],
  },
  {
    version: '6.84.0',
    date: '2026-07-10',
    title: 'Vault graph no longer shows ghost (removed) documents',
    bullets: [
      'The knowledge graph was still drawing document nodes whose files are no longer present — including personal tax documents (K-1s) that were pruned for privacy after an earlier index. The graph now hides any document with no present file location, matching the Files view, so removed/moved/privacy-pruned files can\'t linger as ghost nodes. The lingering K-1 nodes were also deleted outright.',
    ],
  },
  {
    version: '6.83.0',
    date: '2026-07-10',
    title: 'Extraction hardening (security review)',
    bullets: [
      'Hardened the new document-text extraction against argument injection: a file named to start with a dash could have been parsed as a tool flag. Paths are now guarded, pdftotext gets an end-of-options marker, and office files are copied to a controlled name before conversion. Flagged by the automated security review of the previous release.',
    ],
  },
  {
    version: '6.82.0',
    date: '2026-07-10',
    title: 'Markdown mirrors now read real PDFs',
    bullets: [
      'The markdown-mirror generator can finally read binary documents: PDFs are extracted with pdftotext and Office files (docx/xlsx/ppt…) via LibreOffice before the mirror is written — so a mirror now contains the document\'s actual text instead of a placeholder. This unblocks generating the ~2,900 missing mirrors; the nightly sweep and the on-demand sweep both use it.',
    ],
  },
  {
    version: '6.81.0',
    date: '2026-07-09',
    title: 'Document Library shows .md-mirror status (Grok-designed)',
    bullets: [
      'The Document Library now shows, per file, whether its markdown (.md) mirror exists — a teal ".md" chip when it does, a muted "No mirror" when it doesn\'t — plus a per-project coverage bar ("X/Y mirrored") so gaps are obvious at a glance. First slice of the Grok-designed file-inventory view: you can finally see which of your documents are missing their mirror. Generating the missing ones is the next step.',
    ],
  },
  {
    version: '6.80.0',
    date: '2026-07-09',
    title: 'Files now report their markdown-mirror status',
    bullets: [
      'The Document Library API now tells you, for every file, whether its markdown (.md) mirror exists yet — plus a per-project and app-wide coverage count ("X of Y mirrored"). This is the data foundation for the new file-inventory view: you can finally see which documents are missing their mirror. (Today that answer is honest and stark — almost none of the ~2,900 files have one yet; generating them is the next step.)',
    ],
  },
  {
    version: '6.79.0',
    date: '2026-07-09',
    title: 'Usage monitoring across every AI backend',
    bullets: [
      'Bridge now reports how much each model backend is actually being used — calls, tokens, cost and latency per gateway (Claude, Codex, Grok, Antigravity) over rolling 5-hour / 24-hour / 7-day windows, from real dispatch data. It is honest consumption tracking rather than a fake quota scraper: the CLIs do not expose provider quotas, so this shows what we actually spent per backend, the early-warning signal for leaning too hard on one model. (Claude also has real provider rate-limit data via the capacity view.)',
    ],
  },
  {
    version: '6.78.0',
    date: '2026-07-09',
    title: 'Full changelog history restored',
    bullets: [
      'The in-app changelog was only showing releases back to v6.69 — everything before it was missing. Nothing was lost; the feed the changelog reads was simply created at 6.69 and never backfilled. Restored the complete platform history from v6.0.0 (the Orchestration Platform, 4 Apr) up to today, so the changelog now shows every release Porter has shipped.',
    ],
  },
  {
    version: '6.77.0',
    date: '2026-07-09',
    title: 'Porter now follows its own release rules',
    bullets: [
      'Porter adopted the same release-kit every other product uses: it carries a release manifest, its commit hooks record each ship, and the cross-project release audit now shows Porter itself as fully wired — so the one product that enforces release consistency is no longer an exception to it. No change to how Porter builds, deploys, or announces.',
    ],
  },
  {
    version: '6.76.0',
    date: '2026-07-09',
    title: 'Release reconciler hardened (no more mis-announces)',
    bullets: [
      'Fixed the announce reconciler after it posted a garbled update: it now only announces a version when the release notes for that EXACT version exist (never forces a version onto stale notes), reads notes from the typed feed only (no fragile text parsing), and auto-announces Porter only — other apps announce through their own release flow. Safe by construction.',
    ],
  },
  {
    version: '6.75.0',
    date: '2026-07-08',
    title: 'Admin version + changelog now tell the truth (and previews zoom)',
    bullets: [
      'The Porter admin was showing a stale v6.3.0 in the sidebar/footer and a frozen changelog. Both now bake from the ONE backend release truth at deploy — the version matches what is actually running, and the changelog shows the same release notes the group announce uses. Also: the document preview now has zoom in/out/reset controls so an expanded PDF or image can be read at any size.',
    ],
  },
  {
    version: '6.74.0',
    date: '2026-07-08',
    title: 'Release announces are now enforced, not optional',
    bullets: [
      'The group release announcement is no longer something a session has to remember to run — Porter now re-asserts the announce for every project\'s current shipped version every 10 minutes, idempotently. If a release ever ships without its announce (any session, or none), Porter fills the gap automatically within minutes. The ceremony is structural now, not manual.',
    ],
  },
  {
    version: '6.73.0',
    date: '2026-07-08',
    title: 'Release-kit R2 — Porter now audits release consistency',
    bullets: [
      'Porter can now see, and flag drift in, how every project releases: a registry API (/api/admin/releases/*) reports each repo\'s release wiring — manifest present, hooks calling the shared kit, kit version current, version file present — and a drift audit gives one consistent|drift verdict across all projects. This is how Porter enforces one release standard everywhere.',
    ],
  },
  {
    version: '6.72.0',
    date: '2026-07-08',
    title: 'Release-kit R1 — the shared release engine',
    bullets: [
      'First piece of the unified release system: a shared release-kit in Porter (manifest schema + project registry + a porter-release CLI with a pre-commit gate and post-commit run sequence + the shared announce adapter). Groundwork so every project releases the exact same way and Porter can enforce it — not wired into any repo yet.',
    ],
  },
  {
    version: '6.71.0',
    date: '2026-07-08',
    title: 'Porter now announces its own releases',
    bullets: [
      'Porter releases now post to the group automatically the same way ymc.capital ones do — through the one shared announcer, fired from Porter’s own post-commit hook. No more separate manual step that could be forgotten.',
    ],
  },
  {
    version: '6.70.0',
    date: '2026-07-08',
    title: 'Grok joined the model mesh',
    bullets: [
      'Added the xAI Grok CLI (grok-4.5) as a fourth Bridge gateway alongside Claude, Codex and Antigravity — so Grok can be routed to directly and now sits on the design council.',
    ],
  },
  {
    version: '6.69.0',
    date: '2026-07-08',
    title: 'Document Library — every app’s files, deduped and in sync',
    bullets: [
      'New Document Library in the Porter admin: all of an app’s documents, organised the way the knowledge graph sees them (app → project → document), completely de-duplicated (one entry per unique file with every location tracked) and kept in sync so moved or deleted files drop off automatically. Personal material (passports, tax, personal financials) is never indexed. First app live: YMC with ~2,900 documents across 6 projects.',
    ],
  },
  {
    version: '6.68.0',
    date: '2026-07-08',
    title: 'Files perfect-sync',
    bullets: [
      'Added a reconcile pass (POST /vault/reconcile) so the document index exactly matches what is on disk — moved or deleted files are corrected automatically, no drift.',
    ],
  },
  {
    version: '6.67.0',
    date: '2026-07-08',
    title: 'One entry per unique file',
    bullets: [
      'Documents are now de-duplicated by content: the same file appearing in several places collapses to a single indexed entry with every location tracked, instead of many near-duplicate rows.',
    ],
  },
  {
    version: '6.66.0',
    date: '2026-07-08',
    title: 'Document Library foundation',
    bullets: [
      'Laid the groundwork for the Porter Files directory — a table that records every place a given document lives across an app, so the library can show one file with all its locations.',
    ],
  },
  {
    version: '6.65.0',
    date: '2026-07-08',
    title: 'Reorg tooling (dry-run)',
    bullets: [
      'Added config-generation plus move/de-dup runbooks that preview every change before anything is touched — safe planning for large file reorganisations.',
    ],
  },
  {
    version: '6.64.0',
    date: '2026-07-08',
    title: 'Knowledge graph associations',
    bullets: [
      'Vault association engine: records can now link to each other and a focused view expands along those edges, so related knowledge surfaces together instead of in isolation.',
    ],
  },
  {
    version: '6.63.0',
    date: '2026-07-08',
    title: 'Vault-reader shadow canary',
    bullets: [
      'Internal safety step: ran the new vault reader in shadow mode with all flags off to prove zero risk before it goes live.',
    ],
  },
  {
    version: '6.62.0',
    date: '2026-07-07',
    title: 'Tools registry',
    bullets: [
      'First slice of a canonical tools registry so every tool Porter can call is discoverable in one place rather than scattered.',
    ],
  },
  {
    version: '6.61.0',
    date: '2026-07-07',
    title: 'Dead-code cleanup',
    bullets: [
      'Removed the retired brain-ui :5176 surface and unused mail/forge/rpg tables — less dead weight, clearer system.',
    ],
  },
  {
    version: '6.60.0',
    date: '2026-07-07',
    title: 'Identity spine — scope ladder + product registry',
    bullets: [
      'Introduced a scope ladder and product registry so every piece of knowledge and every service knows which app/project/product it belongs to — the backbone for clean multi-app separation.',
    ],
  },
  {
    version: '6.59.0',
    date: '2026-07-07',
    title: 'Porter MCP server (alpha)',
    bullets: [
      'First alpha of the Porter MCP server — lets Claude pull Porter knowledge directly (headless), plus vault review-queue engine operations.',
    ],
  },
  {
    version: '6.58.0',
    date: '2026-07-07',
    title: 'Review-queue placement IDs',
    bullets: [
      'The knowledge-graph read now returns a placement ID for each proposed item so the review queue can accept or refile it precisely.',
    ],
  },
  {
    version: '6.57.0',
    date: '2026-07-07',
    title: 'Admin hygiene',
    bullets: [
      'Housekeeping: zero type-check errors, stopped tracking build artefacts in git, and fixed a dream-run JSON bug.',
    ],
  },
  {
    version: '6.56.0',
    date: '2026-07-07',
    title: 'Graph edges API',
    bullets: [
      'Added edge ingestion (POST /vault/edges) so apps can declare relationships between knowledge nodes, not just the nodes themselves.',
    ],
  },
  {
    version: '6.55.0',
    date: '2026-07-07',
    title: 'MCP management page',
    bullets: [
      'New MCP management screen in the Porter admin, plus removal of dead Forge code.',
    ],
  },
  {
    version: '6.54.0',
    date: '2026-07-07',
    title: 'Derivative loop — raw to markdown',
    bullets: [
      'Vault now derives clean markdown from raw source documents and keeps it fresh, re-generating when the source changes (stale-aware).',
    ],
  },
  {
    version: '6.53.0',
    date: '2026-07-07',
    title: 'Placement accept/refile',
    bullets: [
      'Review-queue operations: a proposed knowledge placement can now be accepted or refiled to a better spot.',
    ],
  },
  {
    version: '6.52.0',
    date: '2026-07-07',
    title: 'Scoped graph reads',
    bullets: [
      'Knowledge-graph reads can now be filtered by layer and focused on a subtree, so an app sees just its slice instead of the whole graph.',
    ],
  },
  {
    version: '6.51.0',
    date: '2026-07-07',
    title: 'Type-checked ingest',
    bullets: [
      'New ingest API accepts type-checked knowledge pushes and returns proposed placements for review before anything is committed.',
    ],
  },
  {
    version: '6.50.0',
    date: '2026-07-07',
    title: 'Apps declare their node types',
    bullets: [
      'Added a register-schema API so each app can declare the kinds of knowledge nodes it produces — the graph adapts per app instead of a fixed shape.',
    ],
  },
  {
    version: '6.49.0',
    date: '2026-07-07',
    title: 'Vault v2 — generic schema',
    bullets: [
      'Foundation of the v2 knowledge graph: a generic six-table schema that can hold any app’s knowledge, replacing the old fixed layout.',
    ],
  },
  {
    version: '6.48.0',
    date: '2026-07-06',
    title: 'Admin revamp — dead screens removed',
    bullets: [
      'Removed the Forge, Email and Skill-Feedback screens from the admin (their backends were already gone, so these were dead frontends) — trimming ~2,000 lines and clearing the way for the MCP, tools and CLI-config views that follow.',
    ],
  },
  {
    version: '6.47.0',
    date: '2026-07-06',
    title: 'Bridge model failover',
    bullets: [
      'Tom no longer breaks when Claude hits a quota or error: every Bridge dispatch now automatically retries the same task on the next model in the chain (Claude → Codex → Antigravity), with the whole failover recorded. Callers can opt out for hard-fail behaviour.',
    ],
  },
  {
    version: '6.46.0',
    date: '2026-07-06',
    title: 'Cleanup + telemetry fix',
    bullets: [
      'Removed the dead documents-tree code, fixed Codex cost/telemetry reporting, and shipped the second slice of the email verdict work.',
    ],
  },
  {
    version: '6.45.0',
    date: '2026-07-06',
    title: 'Knowledge-evolution loop',
    bullets: [
      'A background worker now researches on the cheap model tier and scans GitHub for improvements, filing proposals only — Porter suggests, a human still approves.',
    ],
  },
  {
    version: '6.44.0',
    date: '2026-07-06',
    title: 'Antigravity gateway',
    bullets: [
      'Registered and proved the Antigravity CLI (agy) as a Bridge gateway — another model backend Porter can route to.',
    ],
  },
  {
    version: '6.43.0',
    date: '2026-07-06',
    title: 'Memory unification (U5+U6)',
    bullets: [
      'Shipped the final slices of the memory-unification work that brings Porter memory and the vault into one consistent store.',
    ],
  },
  {
    version: '6.42.0',
    date: '2026-07-05',
    title: 'Rules learned from failures',
    bullets: [
      'New rule-distillation loop: repeated failures now turn into proposed operating rules for review, so Porter learns from what went wrong.',
    ],
  },
  {
    version: '6.41.0',
    date: '2026-07-05',
    title: 'Memory unification (U3+U4)',
    bullets: [
      'Memory injection now prefers the vault as its source, and nightly dream drafts write back into the vault — one knowledge home, not two.',
    ],
  },
  {
    version: '6.40.0',
    date: '2026-07-05',
    title: 'Memory unification (U1+U2)',
    bullets: [
      'Began unifying memory with the vault: a live mirror of memory into the vault plus a concept indexer, so structured knowledge and freeform memory stop drifting apart.',
    ],
  },
  {
    version: '6.39.0',
    date: '2026-07-04',
    title: 'Dream reviewer + docs-match-reality',
    bullets: [
      'Added a reviewer for the nightly dream proposals and a check that flags when documentation no longer matches the running system.',
    ],
  },
  {
    version: '6.38.0',
    date: '2026-07-04',
    title: 'Dead-code batch + mail shutdown',
    bullets: [
      'Cleared a batch of dead code and closed the old mail ports Porter no longer uses.',
    ],
  },
  {
    version: '6.37.0',
    date: '2026-07-04',
    title: 'Unjammed the memory pruner',
    bullets: [
      'Fixed the nightly memory pruner that had stalled, so old low-value memory is cleaned up again.',
    ],
  },
  {
    version: '6.36.1',
    date: '2026-07-02',
    title: 'Active-project fallback + version fix',
    bullets: [
      'The /context endpoint now falls back to the pinned active project when it can’t infer one, and a hardcoded version that had drifted out of sync was fixed.',
    ],
  },
  {
    version: '6.36.0',
    date: '2026-06-25',
    title: 'Nightly memory dream',
    bullets: [
      'The memory distiller became Tom’s nightly “dream” — each night Porter turns the day’s episodes into durable, reviewed knowledge.',
    ],
  },
  {
    version: '6.35.0',
    date: '2026-06-25',
    title: 'Rules supersede on conflict',
    bullets: [
      'When a new operating rule conflicts with an old one, the newer rule now supersedes it cleanly instead of both lingering.',
    ],
  },
  {
    version: '6.34.0',
    date: '2026-06-25',
    title: 'Surprise-salience write-gate',
    bullets: [
      'Memory now only saves what’s genuinely new or surprising, keeping the brain focused instead of hoarding routine noise.',
    ],
  },
  {
    version: '6.33.0',
    date: '2026-06-25',
    title: '“Where we left off” recall',
    bullets: [
      'Added session-scoped recall so Porter can pick up exactly where a previous session left off.',
    ],
  },
  {
    version: '6.32.0',
    date: '2026-06-24',
    title: 'Better recall + durable distiller',
    bullets: [
      'Recall now matches on any of the query terms (broader, more relevant results) and the memory distiller survives restarts.',
    ],
  },
  {
    version: '6.31.3',
    date: '2026-06-14',
    title: 'Agent persona text',
    bullets: [
      'GET /agents/:id now returns the agent’s full persona text.',
    ],
  },
  {
    version: '6.31.2',
    date: '2026-06-13',
    title: 'Bridge stream fix',
    bullets: [
      'Fixed the Claude CLI gateway double-emitting stream chunks.',
    ],
  },
  {
    version: '6.31.1',
    date: '2026-06-11',
    title: 'System screen cleanup',
    bullets: [
      'Stripped the fake “theater” out of the admin System screen and repaired the changelog generator.',
    ],
  },
  {
    version: '6.31.0',
    date: '2026-06-10',
    title: 'Ops revamp',
    bullets: [
      'Rebuilt the admin Ops area on a clean light-only design system, added a Bridge console, and merged the Brain views into one screen.',
    ],
  },
  {
    version: '6.30.1',
    date: '2026-06-10',
    title: 'Honest model lineup',
    bullets: [
      'Refreshed the stale model list and corrected the cost labels so the numbers shown are honest.',
    ],
  },
  {
    version: '6.30.0',
    date: '2026-06-10',
    title: 'Brain cleanup',
    bullets: [
      'Cleaned up the brain: only meaningful episodes are kept, old telemetry is purged, and dead signals were removed from the UI.',
    ],
  },
  {
    version: '6.29.0',
    date: '2026-06-10',
    title: 'Agents read/write the brain',
    bullets: [
      'Non-CLI agents can now read from and write to Porter’s memory directly through a dedicated agent-memory surface.',
    ],
  },
  {
    version: '6.28.1',
    date: '2026-06-02',
    title: 'Per-request model choice',
    bullets: [
      'The Claude CLI gateway now honours a --model passthrough so a specific model can be requested per dispatch.',
    ],
  },
  {
    version: '6.28.0',
    date: '2026-05-31',
    title: 'Leaner backbone',
    bullets: [
      'Stripped the agent-hub “theater” down to a lean backbone — less decoration, clearer core.',
    ],
  },
  {
    version: '6.27.0',
    date: '2026-05-31',
    title: 'Removed Atlas + org chart',
    bullets: [
      'Removed the unused Atlas autonomous agent and the admin org-chart screen.',
    ],
  },
  {
    version: '6.26.0',
    date: '2026-05-29',
    title: 'Dropped the old SaaS surface',
    bullets: [
      'Trimmed the dead client-app SaaS code and the People/Costs admin tabs, sharpening Porter as a backbone rather than a product.',
    ],
  },
  {
    version: '6.25.0',
    date: '2026-05-23',
    title: 'Tom “wrong surface” fix',
    bullets: [
      'Passed --strict-mcp-config to the Claude CLI so Tom stops picking up the wrong toolset and producing noise.',
    ],
  },
  {
    version: '6.24.0',
    date: '2026-05-22',
    title: 'System prompt wiring',
    bullets: [
      'Bridge now routes the system prompt to Claude’s dedicated --system-prompt flag, so agent instructions land correctly.',
    ],
  },
  {
    version: '6.23.0',
    date: '2026-05-19',
    title: 'Directives lookup',
    bullets: [
      'Added a /directives endpoint so agents can fetch the current promoted operating rules on demand.',
    ],
  },
  {
    version: '6.22.0',
    date: '2026-05-18',
    title: 'Porter identity split',
    bullets: [
      'Separated Porter’s own identity from the active project: an active-project pin plus a rewritten session hook, so sessions resolve the right project cleanly.',
    ],
  },
  {
    version: '6.21.0',
    date: '2026-05-18',
    title: 'Codex adapter + Tom fixes',
    bullets: [
      'Shipped the Codex CLI adapter and a batch of Tom bug fixes.',
    ],
  },
  {
    version: '6.18.0',
    date: '2026-05-18',
    title: 'Recall document Q&A',
    bullets: [
      'Recall can now answer questions over ingested documents end-to-end — schema, ingest, retrieval and Codex-synthesised answers.',
    ],
  },
  {
    version: '6.17.1',
    date: '2026-05-15',
    title: 'Checkpoint bump',
    bullets: [
      'Housekeeping release rolling up the Dream Silos work.',
    ],
  },
  {
    version: '6.17.0',
    date: '2026-05-13',
    title: 'Dream Silos — review surface',
    bullets: [
      'Completed the Dream Silos series with an admin review surface: browse, run, and accept or reject the nightly memory proposals.',
    ],
  },
  {
    version: '6.16.0',
    date: '2026-05-13',
    title: 'Software dream worker',
    bullets: [
      'Added the software-silo dream worker and a manual trigger (POST /dream-run) so improvement proposals can be generated on demand.',
    ],
  },
  {
    version: '6.15.0',
    date: '2026-05-12',
    title: 'Raw passthrough',
    bullets: [
      'Added a raw:true passthrough on /chat/stream for callers that want the model output unmodified.',
    ],
  },
  {
    version: '6.14.0',
    date: '2026-05-12',
    title: 'Isolated Claude subprocess',
    bullets: [
      'The Claude CLI backend is now spawned in an isolated working directory so it can’t accidentally inherit Porter’s own operating context.',
    ],
  },
  {
    version: '6.13.0',
    date: '2026-05-11',
    title: 'Transcript capture',
    bullets: [
      'Porter now captures session transcripts, the raw material the memory system learns from.',
    ],
  },
  {
    version: '6.12.0',
    date: '2026-05-11',
    title: 'Silo foundation',
    bullets: [
      'Laid the multi-silo foundation that lets memory and dreams be scoped per domain rather than lumped together.',
    ],
  },
  {
    version: '6.11.0',
    date: '2026-05-10',
    title: 'Bridge console revived',
    bullets: [
      'Restored the Bridge tabs, summary metrics and live activity ticker in the admin.',
    ],
  },
  {
    version: '6.10.0',
    date: '2026-05-10',
    title: 'Honest dispatch metrics',
    bullets: [
      'Separated CLI tool-observability events from real model dispatches so the Bridge numbers reflect actual work.',
    ],
  },
  {
    version: '6.9.0',
    date: '2026-04-17',
    title: 'Bridge simplified to Claude CLI',
    bullets: [
      'Simplified the Bridge down to the Claude CLI backend, cutting the tangle of half-working gateways.',
    ],
  },
  {
    version: '6.8.1',
    date: '2026-04-15',
    title: 'Removed direct API gateway',
    bullets: [
      'Removed the direct Anthropic API gateway in favour of routing through the CLI.',
    ],
  },
  {
    version: '6.8.0',
    date: '2026-04-13',
    title: 'Model correction + DB enforcement',
    bullets: [
      'Corrected the model metadata and added database-trigger enforcement so bad data can’t be written.',
    ],
  },
  {
    version: '6.7.0',
    date: '2026-04-12',
    title: 'Autonomy launch',
    bullets: [
      'Launched the first autonomy features alongside fixes to the openclaw Bridge path.',
    ],
  },
  {
    version: '6.5.0',
    date: '2026-04-10',
    title: 'Intellect, Forge, tools & skills',
    bullets: [
      'Shipped Intellect phases 1–3 plus Forge, the tools and skills registries, and subscriptions — a large capability drop.',
    ],
  },
  {
    version: '6.4.0',
    date: '2026-04-10',
    title: 'Operational roadmap',
    bullets: [
      'Rolled up the tools, skills and evolution work and set the operational Porter roadmap.',
    ],
  },
  {
    version: '6.3.0',
    date: '2026-04-04',
    title: 'Nothing left hidden',
    bullets: [
      'Exposed the remaining five hidden data surfaces as admin pages — every part of Porter’s data is now visible in the admin.',
    ],
  },
  {
    version: '6.2.0',
    date: '2026-04-04',
    title: 'Platform intelligence surfaces',
    bullets: [
      'Surfaced eight previously hidden data areas as new admin pages.',
    ],
  },
  {
    version: '6.1.0',
    date: '2026-04-04',
    title: 'Porter Mail Platform',
    bullets: [
      'Added the Porter Mail platform (later retired) as part of the v6 build-out.',
    ],
  },
  {
    version: '6.0.0',
    date: '2026-04-04',
    title: 'The Orchestration Platform',
    bullets: [
      'The v6 milestone that reframed Porter as the orchestration platform / backbone — the foundation the whole current system is built on.',
    ],
  },
];
