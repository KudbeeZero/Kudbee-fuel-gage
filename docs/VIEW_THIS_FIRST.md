# VIEW THIS FIRST — THINKBOX Manual Test Guide

**For:** Fresh engineer opening THINKBOX for the first time

---

## Step 1: Launch

| Action | Expected |
|:---|:---|
| Run `npm run dev` from project root | Vite dev server starts on localhost:5173 |
| Open `http://localhost:5173/terminal.html` | Terminal loads with boot screen |
| Wait for mount | Terminal displays "Terminal connected — THINKBOX v1.0" |

**What should NOT happen:** White screen, ReferenceError in console, "Ollama Chat" branding.

## Step 2: Terminal Commands

| Command | Expected Output |
|:---|:---|
| `/help` | Shows 8 available commands |
| `/status` | Shows mission, branch, BUS/SSE status |
| `/health` | Shows Guardian PASS, BUS PASS, SSE PASS |
| `/about` | Shows "THINKBOX Interactive Terminal v1.0 — PR-014B" |
| `/clear` | Clears terminal output |
| `/pause` | Toggles event stream pause/resume |

## Step 3: Open THINKBOX

| Action | Expected |
|:---|:---|
| Navigate to THINKBOX tab (if available) | Page loads without crash |
| Status bar visible at bottom | Shows ready score, agent count, BUS/SSE |
| LiveTerminal visible at bottom | Terminal with input prompt `thinkbox:~$` |
| MissionPlanner visible | Shows "Describe your engineering objective" input |

**What should NOT happen:** White screen from ReferenceError. Login screen with passkey prompt.

## Step 4: Status Bar

| Element | Expected |
|:---|:---|
| Ready Score | Shows a number (0-100) |
| Grade Badge | Shows A/B/C letter |
| Agent Count | Shows X/Y agents |
| BUS | Shows LIVE or OFF |
| Execution Status | Shows idle or running |
| SIM/LIVE toggle | Shows SIM (amber) or LIVE (green) |

## Step 5: Known Limitations

| Issue | What You'll See |
|:---|:---|
| Agent Swarm | Placeholder: "Coming in PR-014C" |
| Timeline | Placeholder: "Coming in PR-014D" |
| Execution Panel | Placeholder: "Coming in PR-014E" |
| Learning Center | Shows mock data (not live) |
| Diagnostics | Shows mock metrics (not live) |
| Replay | Shows demo session (not live) |
| Mission Inbox | Shows hardcoded items |
| Today's Mission | Shows hardcoded data |

## Step 6: What to Verify After PR #266 is Merged

1. Terminal loads at `/terminal.html` — no OllamaChat branding
2. THINKBOX page loads — no ReferenceError crash
3. StatusBar shows actual ViewModel data (not hardcoded)
4. LiveTerminal accepts commands: `/help`, `/status`, `/health`
5. MissionPlanner shows input form
6. EngineeringGraphView shows empty graph or seeded nodes
7. No console errors in browser dev tools
