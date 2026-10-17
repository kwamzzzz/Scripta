import { createFileRoute } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import JoinFirmScreen from "@/screens/JoinFirmScreen";

const title = "Join a firm — Scripta";

/* Deliberately NOT wrapped in <Authed>: an invited person arrives here before
   they belong to anything, and the screen's whole job is to tell them which of
   the four situations they are in — including "you are not signed in".

   It DOES need <AuthProvider>, which is a different thing and was missing until
   the first real invitation was opened. Authed is the guard; AuthProvider is
   the context that says who you are, and the screen cannot answer its own
   question without it. Nothing in the product navigated here until a second
   person was invited, so the page had never once been rendered. */
export const Route = createFileRoute("/join/$token")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: "Accept an invitation to join a firm on Scripta." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: function JoinRoute() {
    const { token } = Route.useParams();
    return (
      <AuthProvider>
        <JoinFirmScreen token={token} />
      </AuthProvider>
    );
  },
});
