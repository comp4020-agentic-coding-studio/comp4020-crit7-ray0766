import { defineMiddleware } from "astro:middleware";
// Importing the database module here is what makes migrations (and the boot
// seed) run on the first request the server handles, whatever the route —
// not on the first render of whichever page happens to need the database.
// The middleware itself passes every request straight through.
import "./lib/db";

export const onRequest = defineMiddleware((_context, next) => next());
