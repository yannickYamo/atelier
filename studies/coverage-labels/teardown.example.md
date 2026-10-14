---
request: Write a competitive teardown of Brindle Scheduler (Team plan) for the Tallyrand Dispatch product leadership review.
---

# Teardown: Brindle Scheduler, Team Plan (v6.3)

Examined: 14 September to 2 October 2026, on a paid 5-seat Team subscription plus the public docs.

## Bottom Line

Threat Level: **High**. Brindle Scheduler wins field-service firms under 50 technicians on setup speed and price, and holds a 4.6 score from 318 reviews [1][2][6]. It does not yet reach our larger accounts, because the Team plan routes from one depot only [4].

## Who They Sell To

Brindle Scheduler targets owner-run field-service firms of 5 to 50 technicians, bought by the operations manager when spreadsheets stop coping after a hiring round. One buyer put the reason this way: "we were booking jobs the same afternoon" [3].

## What They Do Well

- **Fast first setup.** I imported 212 customer records from a CSV file and booked a job 11 minutes after signing up.
- **Technician mobile app.** Jobs I assigned on the web reached the test phone within 3 seconds, and notes I wrote offline synced later.
- **Plain pricing page.** Every plan lists its price, seat minimum and limits without a sales call [2].

## Where They Fall Short

- **Single depot only.** When I added a second depot address, the route planner ignored it and started all 5 technicians from the first.
- **Thin reporting.** The only export is a CSV file of completed jobs, so I could not get revenue per technician without a spreadsheet.
- **Slow support replies.** My two tickets were answered after 26 and 31 hours on a plan that promises "next business day".

My read: Brindle shipped 9 releases in 6 months [5], so multi-depot routing on the Team plan is likely within a year.

## Pricing

| Plan | Price | Billing Unit | Notable Limit |
| --- | --- | --- | --- |
| Starter | USD 19 per month | Per technician | 3 technicians maximum |
| Team | USD 34 per month | Per technician | 1 depot |
| Business | USD 52 per month | Per technician | 5 depots, annual billing only |
| Enterprise | Not published | Not published | Not published |

Captured from the Brindle pricing page on 14 September 2026 [2].

## Feature Comparison

Us means Tallyrand Dispatch on the Standard plan.

| Capability | Them | Us | Edge |
| --- | --- | --- | --- |
| Time to first booked job | 11 minutes in my test | About 2 days with onboarding | Them |
| Multi-depot routing | 1 depot on Team | Unlimited depots on every plan | Us |
| Mobile offline mode | Notes and photos sync later | Notes only | Them |
| Revenue reporting | CSV export of jobs | Dashboard per technician | Us |
| Entry price | USD 34 per technician monthly | USD 49 per technician monthly | Them |
| Accounting integrations | 2 listed | 7 listed | Us |
| Support response | 26 to 31 hours observed | 4-hour target on every plan | Us |

## Evidence

1. Hands-on test of the Team plan with 5 seats, run by me, 14 September to 2 October 2026.
2. Brindle public pricing page, captured 14 September 2026.
3. Stackwise review by an operations manager at a 22-technician plumbing firm, 3 August 2026: "we were booking jobs the same afternoon".
4. Brindle help-centre article "Depots and start locations", read 18 September 2026.
5. Brindle public changelog, 9 releases between April and September 2026, read 30 September 2026.
6. Stackwise listing for Brindle Scheduler, 4.6 from 318 reviews, read 30 September 2026.

Not verified: the Enterprise plan's price and depot limit, because Brindle sales did not answer my enquiry.

## What We Should Do

1. Cut Tallyrand Dispatch self-serve setup to under one hour for accounts below 20 technicians (Product, Q4 2026).
2. Stop discounting below USD 40 per technician to match Brindle Scheduler, and sell multi-depot routing and reporting instead (Sales, from November 2026).
3. Ship photo capture in offline mode (Mobile, Q1 2027).
