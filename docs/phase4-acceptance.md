# Phase 4 — two-user browser acceptance

**Adversarial, not confirmatory.** The last one of these found three defects the
suites had missed. The point is not to watch the features work; it is to try the
things the suites cannot reach — two live sessions, a real websocket, and an
entitlement that ends while somebody is still looking at the screen.

Needs both people signed in, both watching. Claude cannot sign in, so Podrick's
session is Kwame at the keyboard.

```bash
cd ~/praxis
npx vite dev --host 127.0.0.1 --port 8085 --strictPort
```

Mawusi (Kwame) in one browser profile, Podrick in another. Start with Podrick as
**Editor on Atlas Industrial Supplies**, which is the live state.

Matter A = **Atlas** (`c0c2b172`), which Podrick is on.
Matter B = **Personal Trade Management** (`99bc433c`), which he is not.

---

## 1 · A thread appears without a reload

- [ ] Podrick comments on a clause in Atlas. It appears on Mawusi's screen
      **without a refresh**.
- [ ] Mawusi replies. It appears under the root on Podrick's screen, not as a
      second root.
- [ ] Both counts ("n OPEN") agree.

*What would be wrong:* the comment arriving only on reload means the realtime
subscription is not running. The suites cannot see this at all.

## 2 · A mention creates nothing

- [ ] Mawusi types `@` in a thread on Atlas. The picker offers **only the Atlas
      team**. Nobody else in the firm appears.
- [ ] Mawusi mentions Podrick and posts.
- [ ] **Podrick's Tasks list is unchanged.** No new task. Check the count.
- [ ] Atlas carries a **dot** in Podrick's matters list.
- [ ] Podrick opens Atlas. The dot clears.
- [ ] Mawusi mentions him again. The dot comes back.

*What would be wrong:* a task appearing. That is the single decision the four
verbs exist to protect, and it is the one thing that would make Tasks stop
meaning "what do I have to do".

## 3 · Request, and decline

- [ ] Mawusi asks Podrick to do something (Matter team card → "Ask someone to do
      something").
- [ ] A task appears in Podrick's list.
- [ ] Podrick declines **without a reason** — refused.
- [ ] Podrick declines with a reason.
- [ ] The task **returns to Mawusi's list**. It has not vanished.
- [ ] The reason is visible in the matter's activity.

## 4 · The review round trip, on both screens

- [ ] Mawusi asks Podrick to review a clause. A task appears for Podrick.
- [ ] Podrick presses **Start reviewing**. Mawusi's screen shows *In review*.
- [ ] Podrick requests changes with a reason. Mawusi sees *Changes requested*
      and the reason.
- [ ] Podrick's task is now **Done**.
- [ ] Mawusi resubmits. Both screens show *Requested*.
- [ ] Podrick approves. Both screens show *Approved*, and **no further buttons
      appear on either screen** — approved is terminal.

## 5 · Resolution is earned

Set up: Mawusi raises a thread on a task assigned to **Mawusi**.

- [ ] Podrick, an Editor, sees the thread and **no Resolve control** on it.
- [ ] Mawusi sees Resolve, and it works.
- [ ] On a task assigned to **Podrick**, Podrick **does** see Resolve on a
      thread Mawusi raised — he is responsible for the work.

*What would be wrong:* a Resolve button that is shown and then refused. The
control is drawn against the same predicate that judges it, so being shown one
that fails means the two have drifted.

## 6 · Editing is an alteration of the record

- [ ] Podrick edits his own comment. Mawusi sees the new text and **Edited**
      with a time.
- [ ] Podrick cannot edit one of Mawusi's — no Edit control.
- [ ] The matter's activity carries a `comment.edited` entry, and the **previous
      text** is in it.

## 7 · Demotion, mid-flight

With Podrick still on screen, Mawusi demotes him to **Viewer** on Atlas.

- [ ] Podrick's comment box **goes**. So do Reply, Resolve and the review
      controls.
- [ ] He can still **read** every thread.
- [ ] A review addressed to him can no longer be moved by him.
- [ ] **Mawusi, as Lead, can still move it** — and can reassign it.

*Both halves matter.* Proving somebody was stopped is the easy half; proving
somebody can still act is the half a confirmatory test skips.

## 8 · Removal, mid-flight

With Podrick still on screen, Mawusi removes him from Atlas.

- [ ] Live updates to him **stop**.
- [ ] On refresh, the matter and its threads are **gone** — not an error, gone.
- [ ] He can no longer be mentioned: he disappears from Mawusi's `@` picker.

## 9 · Matter B stays invisible throughout

The standing check, run at the end and at any point it occurs to you:

- [ ] Matter B never appears in Podrick's matters list.
- [ ] It never appears in any count, any mention picker, or any live update.
- [ ] Pasting B's URL directly gives him nothing.

---

## What the suites already proved, so do not spend time here

Every permission refusal at the write, every null branch, the four-state
transition table, the team-only mention rule, what is published to realtime.
158 assertions across seven files.

**What only this test can prove:** that the websocket actually stayed silent,
that a control is absent rather than merely refused, and that the two screens
agree at every step.

## If something is wrong

Write down what was on **both** screens, not just the one that looked wrong. The
Phase 3 defects were all found by noticing that two screens disagreed about
something neither of them was obviously wrong about.
