# Brainstorm Hub 🧠

A hub for brainstorming inside the **GitHub Copilot app**.

Click "Use this template" to add this repo template to your own GitHub account.

Open a session here and the assistant becomes a brainstorm interviewer: it asks short,
probing questions to help you explore and clarify your own ideas. When you're done,
it writes up a clean summary of your idea and saves it as a markdown document
that you can browse in a canvas in the GitHub Copilot app (or in the repo itself).

This was built around the open [Brainstory prompts](https://github.com/brainstory/prompts)!

## How it works

1. **Start talking.** Begin a session and just start brainstorming, or open the
   **Brainstorm Hub** canvas and press **New idea**. The assistant leads the
   conversation, asking one concise question at a time. Voice mode is encouraged!
2. **Finish & save.** When you've talked it through, press **Finish & save idea**.
   The assistant turns the conversation into a *Result Document* written from your
   perspective and saves it to [`ideas/`](./ideas).
3. **Browse your ideas.** The canvas shows a dashboard of every saved idea. Click one
   to read it.
4. **Riff on an idea.** With an idea open, press **Riff on this idea** to start a new
   brainstorm that builds on it — extend it, react to specific points, or walk through
   it point by point.

## The canvas

The extension lives in [`.github/extensions/brainstorm-hub/`](./.github/extensions/brainstorm-hub):

| File | Purpose |
| --- | --- |
| `extension.mjs` | Wiring: the canvas, the `save_idea` tool, system steering, transcript capture, and the loopback server that backs the UI. |
| `ui.mjs` | The canvas iframe (dashboard + idea viewer). |
| `prompts.mjs` | The brainstory interview / result / reaction prompts. |

## Saving ideas

Everything you save goes into `ideas/`, which is **git-ignored** (see
[`ideas/.gitignore`](./ideas/.gitignore)). If you use this repo as a template, you
can keep them ignored, *or* delete that file.

With the file, your own ideas stay local to your machine. Without it, you can commit them
if you want to keep them in version control.
