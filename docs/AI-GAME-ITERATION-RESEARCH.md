# Evidence for better AI game iteration

Research checked 14 October 2026. The strongest reusable idea is to close the loop around observed play, with a separate quality judgement and a preserved baseline. A longer prompt or a larger agent swarm does not establish a better game.

This is a shortlist of useful, evidenced methods, not a worldwide ranking of the best AI-made games. Selection favours shipped artifacts, before/after records, reproducible methods and measured comparisons. Creator reports remain self-reports. The examples were researched through primary publications and store listings; their games were not independently played in this review. An attempted browser inspection was blocked by a disconnected browser connection.

## The examples worth learning from

| Example | Evidence and quality assessment | Technique to carry forward |
|---|---|---|
| **Play2Code / PlaytestArena** | Strongest measured workflow evidence in this shortlist. The authors report 66.8% rubric pass rate across 200 browser-game tasks: 37.1 percentage points above single-pass generation and 14.6 above an agentic coding baseline. These are behavioural rubric scores, not ratings of fun or AAA quality. | Have a GUI player exercise each build and leave reproducible observations for the next edit. |
| **BattleTabs settlement / Brandon Wu's Gauntlet Loop experiment** | Closest match to the overnight visual-polish ambition. The creator presents successive scene results and reports more than 16 hours of work. It does not establish Nintendo-equivalent quality or an independently verified improvement in gameplay. | Separate component builders from fresh-context visual critics; give each a bounded subject to improve. |
| **Block Orbit and Gridrise / Omar Alhaddad** | Concrete shipped mobile games with first-party development retrospectives and live store listings. Useful evidence of completing products, not proof they are outstanding games. | Specify the desired response to a player action precisely; reuse asset-generation checks and maintain architecture/design notes. |
| **Dark Factory / x00F** | Detailed operator account covering four Love2D games and specific classes of visual/state bugs. No independent quality benchmark in the article. | Combine autoplay through real game logic, visual inspection and explicit state-transition checks. |
| **The Sims Mobile automated playtesting research** | Published research reporting that simulation findings influenced a released game's design. This predates LLM coding and is evidence for automated testing, not overnight game generation. | Run many cheap mechanical simulations to investigate balance, alongside actual-client playtests. |

### Play2Code

The research pairs a coding agent with a browser GUI playtester and accumulated memory. The paper also reports disagreement with human judges and continued advantages for human refinement. Its “complexity” tiers are defined using observed improvement, so their results do not independently prove that complexity causes a plateau. Use this as support for interaction-based feedback, not a promise that an agent can evaluate demanding flight feel. [Paper](https://arxiv.org/html/2605.28258v1), [project and demo gallery](https://continual-game-generation.vercel.app/).

### BattleTabs

Wu reports using 40–50 agents on average, including workers and critics, with an orchestrator coordinating the scene. The transferable part is role separation and focused visual comparison. The large swarm and instructions to continue until critics are impressed are not necessary ingredients demonstrated by a controlled comparison. Start much smaller; expanding concurrency creates integration and resource contention costs. [Creator's account and before/after material](https://pepwuper.com/goal-work-critic-repeat-learnings-from-gauntlet-loop/).

### Block Orbit and Gridrise

Alhaddad describes concrete conversational adjustments to game feedback, asset checks against a reference, and persistent architecture notes. He also reports rendering-debugging and regression difficulties. I verified both App Store listings. Block Orbit's US listing showed 2.8/5 from only four ratings when checked: too little evidence for a broad verdict, but a reason not to present “shipped with AI” as equivalent to excellent. [Retrospective](https://omar-alhaddad.com/articles/game-dev-with-claude-post-mortem), [Block Orbit](https://apps.apple.com/us/app/block-orbit-3d-stack-match/id6760600736), [Gridrise](https://apps.apple.com/us/app/gridrise-skyscraper-puzzle/id6759220447).

### Dark Factory

The useful combination is a demonstration player exercising normal logic plus screenshots at meaningful states. Its published promotion mechanism recognises milestone text and only advances status. Do not copy that: a claim that QA passed is not evidence, and a later regression must invalidate readiness. Tie acceptance to a specific commit and actual test artifacts. The operator explicitly acknowledges limits around feel and real hardware. [Operator's technical account](https://x00f.com/ai-qa-testing-games/).

### The Sims Mobile

The researchers explored a separate simplified mechanics model over thousands of simulations, finding action imbalances and weak rewards. Their abstract reports resulting design changes. Our adaptation should preferentially reuse the real simulation where practical: a separate model risks drifting from the game. Simulation evidence still cannot verify UI, sound or control-device integration. [Research paper](https://arxiv.org/abs/1811.06962).

## Useful ideas without demonstrated quality leadership

[Snapblox](https://github.com/DevMello/snapblox) publishes an overnight builder/reviewer architecture and morning handoffs. It is an implementation reference, not evidence of superior finished games. [Chaitanya Prabuddha's workflow essay](https://www.chaitanyaprabuddha.com/blog/ai-game-development-prototype-to-playtest) recommends narrow ownership, replayable scenarios, configuration-based tuning and telemetry. Those are sensible design ideas, but the essay is not a comparative experiment. Neither needs to be installed to borrow its useful practices.

## What to adopt

The following is our synthesis, not a reported recipe proven by a single source:

1. Express quality as player-visible outcomes and protect the game's identity.
2. Freeze a known-good build and repeatable scenes before making changes.
3. Make one improvement hypothesis at a time; compare before and after on the same inputs and hardware.
4. Use three complementary checks: fast simulation, actual-input browser play, and human feel/hardware acceptance.
5. Give critics evidence and the design brief, without the builder's persuasive explanation of why its change is good.
6. Require failure reproduction, changed behaviour and a regression check before accepting a repair.
7. Preserve short records of failed approaches and why they failed, so later sessions do not repeat them.
8. Stop loops that no longer produce evidence of improvement. Save alternatives when taste is unresolved.

Avoid optimizing for feature count, reviewer praise, screenshot beauty alone or universal player success. A deliberately difficult manipulation game can become worse while its completion rate rises.

Use [the reusable playbook and prompts](AI-GAME-ITERATION-PLAYBOOK.md) to apply these ideas. The overnight workflow is documented, not yet installed or scheduled.
