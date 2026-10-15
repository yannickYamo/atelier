// tests/fixtures/shortform.ts — ONE INVENTED AUTHOR'S TWEETS, AND TEN PIECES THAT ARE NOT THEIRS.
//
// The author (invented: a solo founder who builds a small database tool) writes two to four short declarative
// sentences, opens on a claim or a number, closes on the shortest sentence, never uses a hashtag, a mention or an
// emoji, and capitalises the first word. Twenty pieces, 90 to 230 characters. The bad pieces each miss in one named
// way, so a test can say which rule should have caught which.

export const GOOD: readonly string[] = [
  'Shipped the index rebuild at 2am. Nobody noticed, which was the point. Your best releases are the ones nobody talks about.',
  'Your roadmap is a list of guesses with dates on them. Date the guesses, not the features. The dates will move anyway.',
  'Three customers asked for the same export last week. Two of them described it as a different feature. Listen for the shape you keep hearing, not the words.',
  'A query that takes 400ms in staging takes 4s in production. The difference is never the code. It is the data you did not copy.',
  'Spent the morning deleting a feature nobody used. The dashboard got faster and the docs got shorter. Deletion is a release you can ship today.',
  'Most outages here start as a config change someone was sure about. We now review config like code. You do not need more confidence.',
  'The first version of the migration tool was a shell script. It ran for eleven months. Nobody needed the second version.',
  'Pricing pages are read by people who have already decided. Make the decision easy to confirm. Then get out of your reader’s way.',
  'Wrote the postmortem before the fix this time. Knowing what we would write changed what we fixed. You should try it once.',
  'Two support tickets in a day about the same button means the button is wrong. Not the users. Move the button.',
  'Half of our cold starts came from one import. It loaded a date library for a single format call. You never need the whole library.',
  'Every dashboard I have built was looked at for a week. The alerts are what people keep. Build the alert first, not the chart.',
  'A customer sent a bug report with a reproduction, a screenshot and a guess at the cause. The guess was right. Answer those people before you answer anyone else.',
  'Renamed the one confusing table in the schema. Four onboarding questions disappeared from the support queue. Names are not cosmetic.',
  'The slowest part of our deploy was waiting for a human to click approve. We moved the approval earlier. Your pipeline is not the bottleneck.',
  'Nobody reads the changelog until something breaks. Then they read all of it. Write it for that reader, not for your team.',
  'Fourteen months in and the hardest problems are still naming things and deciding what not to build. The code is the easy part.',
  'Turned off the weekly metrics email. Three people asked where it went. Now those three get it, and the other sixty do not.',
  'A good error message tells you what happened, what it means and what to do next. Ours did one of the three. Fixed the other two today.',
  'The feature request that comes with a workaround is the one to ship. The workaround is your spec. The person has already tested it.',
];

export interface Bad { readonly why: string; readonly text: string }

export const BAD: readonly Bad[] = [
  { why: 'a corporate paragraph of 486 characters', text: 'We are thrilled to announce that our platform has been enhanced with a comprehensive suite of next-generation capabilities designed to empower teams to leverage data-driven insights at scale. By seamlessly integrating best-in-class infrastructure with an intuitive user experience, we are enabling organizations of all sizes to unlock new levels of productivity and operational excellence. We remain committed to delivering innovative solutions that drive outcomes for our partners now.' },
  { why: 'over the platform limit at 331 characters', text: 'Shipped the index rebuild at 2am, after three weeks of planning and two false starts, and the thing that surprised me most was not the performance improvement, which was real, but how quiet it all was: nobody noticed, nobody asked, nobody filed a ticket, and that silence, it turns out, was exactly the point of the whole exercise.' },
  { why: 'question-heavy: three questions in 25 words', text: 'Why do outages happen? Who approved the config change? What would you have done differently, and why does nobody ask before the release?' },
  { why: 'hashtag spam', text: 'Shipped the index rebuild tonight. #devops #database #startup #buildinpublic #shipping #indiehacker' },
  { why: 'flat and generic, with emoji', text: '🚀 Excited to share some updates! 🎉 We have been working hard and have lots of great things coming soon. Stay tuned! 🙌✨' },
  { why: 'mention spam', text: 'Thanks @alice.dev @bob_builds @carol.ops @dan_db @erin.sre for the feedback on the rebuild, more soon.' },
  { why: 'a thread of one-word lines', text: 'Shipped.\n\nIndex.\n\nRebuild.\n\n2am.\n\nNobody noticed.\n\nThat was the point.\n\nBoring releases.\n\nAre the goal.' },
  { why: 'one sixty-word sentence', text: 'The slowest part of our deploy was the wait for a human to click approve, so we moved the approval earlier in the pipeline where the diff is still small and the reviewer still remembers the change, and deploys went from forty minutes to nine without anyone having to work faster or review less carefully than before.' },
  { why: 'a corporate announcement with exclamation marks', text: 'Big news! Our team is proud to leverage cutting-edge technology to deliver a seamless, best-in-class experience for every customer! Reach out to learn more!' },
  { why: 'opens on a question and closes on a question, lower-case first word', text: 'why is the pricing page so long? people have already decided by the time they get there. so what is all that text for?' },
];
