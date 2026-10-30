# We hired a contractor to break our authentication

Three weeks, fixed fee, one instruction: get into a customer account that is not yours.

She got in on day four. Not through a cryptographic weakness. Our password-reset email contained
a link with a token valid for 24 hours and no single-use flag, and our support team routinely
forwarded those emails to customers who said they had not received them. The token was in the
forwarded thread, in the customer's inbox, and in the support tool's history.

We made the token single-use and cut the window to 30 minutes. That was a two-hour change.

The part that took longer was the support workflow, because the reason support forwarded those
emails was that our delivery rate to certain corporate mail servers was around 88%, and telling
support to stop forwarding without fixing deliverability would have moved the problem to the
customers who could not log in at all. We fixed deliverability first and changed the workflow
second, in that order, deliberately.

What I did not do is run a second engagement to confirm the fix. I should. The honest state is
that one person did not find a second way in during the remaining eleven days, and that is
weaker evidence than it sounds.

If you are going to buy an attack, buy the part where someone tells you why your team built the
hole. She spent a day on the fix and two days on the workflow, and the second day was the one
worth the money.
