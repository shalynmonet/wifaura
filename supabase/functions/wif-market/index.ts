import { withSupabase } from "npm:@supabase/server@1.9.2";
import { marketHandler } from "./handler.ts";
// The platform JWT switch is off because this is service-to-service API-key
// authentication. The wrapper requires a valid secret key from THIS project.
Deno.serve(withSupabase({ auth: "secret:*" }, (req) => marketHandler(req)));
