`npm install` fails with EACCES: npm is trying to write to `/usr/lib/node_modules`, which your user can't write to.

Fix: install Node through nvm so global packages live in your home directory, then rerun `npm install`. Don't use `sudo npm install`.
