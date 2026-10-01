The event loop lets one JavaScript thread handle many tasks by never waiting on slow work.

1. Your code runs to completion on the call stack.
2. Slow work (a timer, a network call) is handed to the runtime, which calls back when it's ready.
3. Callbacks wait in a queue. When the stack is empty, the loop takes the next one.
4. Promises use a second queue, the microtask queue, which empties before the next callback runs.

That's why a `setTimeout(fn, 0)` still runs after a resolved promise's `.then`.

Next: if you want, I can walk through a snippet that prints in an order that surprises people.
