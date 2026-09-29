# Our on-call rotation was quietly costing us a senior engineer a year

We did not measure this until someone left and said so in an exit interview.

The rotation was six people, one week each, which reads as light. It was not light. The pager
fired an average of 4.2 times per night shift, and 70% of those were a disk-usage alert on a
log volume that nobody had tuned since 2023. People were not burning out on hard problems. They
were burning out on the same easy problem, at 3am, forty times a quarter.

We fixed the alert. That took two hours and should have happened two years earlier.

Then we did the part that mattered more. Every alert now has to name the action the responder
should take. If nobody can write that sentence, the alert does not go to a pager, it goes to a
dashboard. We deleted 31 of 58 alerts on the first pass under that rule.

The pager now fires 0.4 times per night shift. Two people have told me unprompted that on-call
is survivable. I do not have a retention number yet and I am not going to invent one.

The lesson is not "tune your alerts." It is that an alert with no action attached is a request
for someone to feel bad at 3am, and we had 31 of them.
