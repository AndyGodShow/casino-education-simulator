# Accessibility and Test Maintenance Remediation Implementation Plan

> **For Arc:** Use /arc:implement to execute this plan. Subagents should report DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED, or AUTH_GATE.

**Source:** `docs/arc/audits/2026-07-13-full-codebase-reaudit.md` — accessibility and test-maintenance findings
**Goal:** Make every traditional game keyboard- and screen-reader-operable, replace false-confidence tests, and reduce maintenance noise without changing game rules or payouts.
**Stack:** React 19 + Vite 7 + TypeScript 5.9 + Vitest 4 + Playwright 1.60 + npm
**Planned at:** `8332a25`
**Out of scope:** Visual redesign; payout, probability, balance, and simulation-rule changes; production API behavior beyond asserting the existing OpenFootball request contract; adding a new component-test framework.

---

<task id="1" depends="" type="auto">
  <name>Establish the traditional-game accessibility E2E harness and shared simulation labels</name>
  <files>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
    <modify>src/components/SimulationPanel/SimulationPanel.tsx</modify>
  </files>
  <read_first>
    tests/e2e/world-cup-public-data.spec.ts
    tests/e2e/smoke.spec.ts
    src/components/SimulationPanel/SimulationPanel.tsx
  </read_first>
  <action>
    Create a Playwright file with the eight canonical `/traditional/games/*` routes and the existing `AxeBuilder` zero-violation helper. Add stable ids and matching `htmlFor` values for test method, strategy, rounds, base bet, and initial balance. Prefix ids with `simulation-`; do not rely on placeholder text.
  </action>
  <test_code>
    test('shared simulation controls have programmatic labels', async ({ page }) => {
      await page.goto('/#/traditional/games/roulette');
      await page.getByRole('button', { name: '模拟测试' }).click();
      await expect(page.getByLabel('模拟局数:')).toBeVisible();
      await expect(page.getByLabel('初始注码:')).toBeVisible();
      await expect(page.getByLabel('初始本金:')).toBeVisible();
      await expect(page.getByLabel('下注策略:')).toBeVisible();
    });
  </test_code>
  <verify>
    `npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "shared simulation"` — passes.
    `npm run typecheck` — exits 0.
  </verify>
  <done>All shared simulation labels target a unique form control and are selectable with `getByLabel`.</done>
  <commit>fix(a11y): associate shared simulation labels</commit>
</task>

<task id="2" depends="1" type="auto">
  <name>Label custom stake inputs in Baccarat, Blackjack, Roulette, and Slots</name>
  <files>
    <modify>src/games/baccarat/components/Controls/Controls.tsx</modify>
    <modify>src/games/blackjack/components/BlackjackControls.tsx</modify>
    <modify>src/games/roulette/components/RouletteControls.tsx</modify>
    <modify>src/games/slots/components/SlotControls.tsx</modify>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
  </files>
  <read_first>
    src/games/baccarat/components/Controls/Controls.tsx
    src/games/blackjack/components/BlackjackControls.tsx
    src/games/roulette/components/RouletteControls.tsx
    src/games/slots/components/SlotControls.tsx
  </read_first>
  <action>
    Give each custom input a unique id and accessible label: `自定义下注金额` for Baccarat/Blackjack/Roulette and `自定义每线注额` for Slots. Use a visually hidden `<label>` and keep input type, parsing, min/max, and placeholder behavior unchanged. Update E2E selectors from placeholder to label.
  </action>
  <test_code>
    for (const route of ['baccarat', 'blackjack', 'roulette']) {
      await page.goto(`/#/traditional/games/${route}`);
      await expect(page.getByLabel('自定义下注金额')).toBeVisible();
    }
    await page.goto('/#/traditional/games/slot-machine');
    await expect(page.getByLabel('自定义每线注额')).toBeVisible();
  </test_code>
  <verify>`npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "custom stake"` — passes.</verify>
  <done>Four custom stake inputs expose stable accessible names without changing value handling.</done>
  <commit>fix(a11y): label primary game stake inputs</commit>
</task>

<task id="3" depends="2" type="auto">
  <name>Label custom stake inputs in the remaining games</name>
  <files>
    <modify>src/games/craps/CrapsGame.tsx</modify>
    <modify>src/games/dragontiger/DragonTigerGame.tsx</modify>
    <modify>src/games/sangong/SanGongGame.tsx</modify>
    <modify>src/games/sicbo/components/SicBoControls.tsx</modify>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
  </files>
  <read_first>
    tests/e2e/traditional-games-accessibility.spec.ts
  </read_first>
  <action>
    Label the Craps, Dragon Tiger, San Gong, and Sic Bo custom stake inputs as `自定义下注金额`. Use stable ids plus visually hidden labels while preserving parsing and bounds.
  </action>
  <test_code>
    for (const route of ['craps', 'dragon-tiger', 'three-card', 'sic-bo']) {
      await page.goto(`/#/traditional/games/${route}`);
      await expect(page.getByLabel('自定义下注金额')).toBeVisible();
    }
  </test_code>
  <verify>
    `npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "custom stake"` — passes.
    `npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "custom stake"` — Axe reports no `label` violations in each game mode.
  </verify>
  <done>All eight game stake inputs have programmatic labels.</done>
  <commit>fix(a11y): label remaining game controls</commit>
</task>

<task id="4" depends="3" type="auto">
  <name>Replace the roulette pointer-only betting surface with native buttons</name>
  <files>
    <modify>src/games/roulette/components/RouletteTable.tsx</modify>
    <modify>src/games/roulette/components/RouletteTable.module.css</modify>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
  </files>
  <read_first>
    src/games/roulette/components/RouletteTable.tsx
    src/games/roulette/RouletteGame.tsx
    src/games/roulette/hooks/useRouletteGame.ts
  </read_first>
  <action>
    Convert number 0–36, columns, dozens, and outside bets from clickable divs to `<button type="button">`. Preserve the grid and visual styles, add `:focus-visible`, and provide names such as `直注 17，当前下注 $100`, `红色`, and `第一打 1 到 12`. Do not use `aria-pressed` because bets accumulate. Keep street/line buttons native and add explicit type/name where needed.
  </action>
  <test_code>
    const seventeen = page.getByRole('button', { name: /直注 17/ });
    await seventeen.focus();
    await page.keyboard.press('Enter');
    await expect(seventeen).toHaveAccessibleName(/当前下注 \$100/);
    await page.keyboard.press('Space');
    await expect(seventeen).toHaveAccessibleName(/当前下注 \$200/);
  </test_code>
  <verify>`npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "roulette keyboard"` — Enter and Space each place exactly one bet.</verify>
  <done>Every roulette bet target is a named, focusable native button with visible focus.</done>
  <commit>fix(roulette): make betting table keyboard operable</commit>
</task>

<task id="5" depends="4" type="auto">
  <name>Create one live game-status announcer and integrate the first three games</name>
  <files>
    <create>src/components/Common/GameStatusAnnouncer.tsx</create>
    <modify>src/games/baccarat/BaccaratGame.tsx</modify>
    <modify>src/games/blackjack/BlackjackGame.tsx</modify>
    <modify>src/games/roulette/RouletteGame.tsx</modify>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
  </files>
  <read_first>
    src/games/baccarat/components/GameTable/GameTable.tsx
    src/games/blackjack/components/BlackjackTable.tsx
    src/games/roulette/hooks/useRouletteGame.ts
    src/App.css
  </read_first>
  <action>
    Add `GameStatusAnnouncer({ message, balance })`, rendering one visually hidden `role="status" aria-live="polite" aria-atomic="true"` region. Integrate it once at each game root with the existing game message and balance. Do not add competing live attributes to visual message nodes.
  </action>
  <test_code>
    await page.goto('/#/traditional/games/roulette');
    await expect(page.getByRole('status')).toHaveCount(1);
    await expect(page.getByRole('status')).toContainText('余额');
  </test_code>
  <verify>`npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "live status"` — passes for the three routes.</verify>
  <done>Baccarat, Blackjack, and Roulette each expose exactly one atomic polite status region.</done>
  <commit>fix(a11y): announce primary game status changes</commit>
</task>

<task id="6" depends="3,5" type="auto">
  <name>Integrate live status announcements in Slots, Sic Bo, and Craps</name>
  <files>
    <modify>src/games/slots/SlotGame.tsx</modify>
    <modify>src/games/sicbo/SicBoGame.tsx</modify>
    <modify>src/games/craps/CrapsGame.tsx</modify>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
  </files>
  <read_first>
    src/components/Common/GameStatusAnnouncer.tsx
    tests/e2e/traditional-games-accessibility.spec.ts
  </read_first>
  <action>Integrate the shared announcer once per game with the existing result/message and balance. For Slots, derive a concise message from phase and total win. Do not announce decorative reel symbols or every animation frame.</action>
  <test_code>Extend the parameterized `live status` test for Slots, Sic Bo, and Craps; assert one status region and an update after the primary action.</test_code>
  <verify>`npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "live status"` — the six integrated route cases pass.</verify>
  <done>Slots, Sic Bo, and Craps each announce meaningful phase/result and balance updates once.</done>
  <commit>fix(a11y): announce dice and slot game results</commit>
</task>

<task id="7" depends="6" type="auto">
  <name>Integrate live status announcements in Dragon Tiger and San Gong</name>
  <files>
    <modify>src/games/dragontiger/DragonTigerGame.tsx</modify>
    <modify>src/games/sangong/SanGongGame.tsx</modify>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
  </files>
  <read_first>
    src/components/Common/GameStatusAnnouncer.tsx
    tests/e2e/traditional-games-accessibility.spec.ts
  </read_first>
  <action>Integrate the shared announcer once per game with the existing message and balance. Announce the resolved hand result only once, not individual card reveals.</action>
  <test_code>Extend Task 5's parameterized `live status` test for Dragon Tiger and San Gong and assert exactly one status region per route.</test_code>
  <verify>`npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "live status"` — all eight route cases pass.</verify>
  <done>Dragon Tiger and San Gong complete the single-announcer coverage for all eight games.</done>
  <commit>fix(a11y): announce card comparison results</commit>
</task>

<task id="8" depends="7" type="auto">
  <name>Honor reduced motion in the slot machine</name>
  <files>
    <modify>src/games/slots/components/SlotMachine.tsx</modify>
    <modify>src/games/slots/components/SlotMachine.module.css</modify>
    <modify>src/games/slots/components/SlotControls.module.css</modify>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
  </files>
  <read_first>
    src/games/sicbo/components/SicBoDice.module.css
    src/games/craps/components/CrapsDice.module.css
    src/utils/motion.ts
  </read_first>
  <action>
    Add a reduced-motion media branch that removes slot animations/transitions. In TSX, observe `matchMedia('(prefers-reduced-motion: reduce)')`; when true, show the target win immediately and do not start reel symbol intervals or count-up requestAnimationFrame loops. Game timing and settlement remain unchanged.
  </action>
  <test_code>
    await page.addInitScript(() => {
      const nativeInterval = window.setInterval;
      const nativeRaf = window.requestAnimationFrame;
      Object.assign(window, {
        __slotMotionCalls: { interval: 0, raf: 0 },
        setInterval: (...args: Parameters<typeof setInterval>) => {
          window.__slotMotionCalls.interval += 1;
          return nativeInterval(...args);
        },
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          window.__slotMotionCalls.raf += 1;
          return nativeRaf(callback);
        },
      });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/traditional/games/slot-machine');
    await page.evaluate(() => { window.__slotMotionCalls = { interval: 0, raf: 0 }; });
    await page.getByRole('button', { name: /旋转/ }).click();
    await expect.poll(() => page.evaluate(() => window.__slotMotionCalls)).toEqual({ interval: 0, raf: 0 });
    await expect(page.getByRole('status')).toContainText(/赢得|未中奖|余额/);
    await expect(page.locator('[class*=light]').first()).toHaveCSS('animation-name', 'none');
  </test_code>
  <verify>`npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "reduced motion"` — passes.</verify>
  <done>Reduced-motion users see final slot state without infinite CSS or JS-driven reel/count-up motion.</done>
  <commit>fix(slots): honor reduced motion preference</commit>
</task>

<task id="9" depends="8" type="auto">
  <name>Raise all interactive controls to the 44-pixel touch baseline</name>
  <files>
    <modify>src/App.css</modify>
    <modify>src/games/roulette/components/RouletteTable.module.css</modify>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
  </files>
  <read_first>
    src/App.css
    src/games/roulette/components/RouletteTable.module.css
  </read_first>
  <action>Establish a global `button { min-width: 44px; min-height: 44px; }` interactive baseline, including compact media queries, then keep roulette grid buttons at least 44px in their module. Preserve dense layouts with wrapping/overflow rather than shrinking targets; do not resize decorative non-buttons.</action>
  <test_code>At viewport 390×844, collect header, roulette number, combo, and reset button bounding boxes and assert both dimensions are `>= 44`.</test_code>
  <verify>`npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "touch targets"` — passes.</verify>
  <done>Every native game button, including headers, reset controls, and roulette bets, has a 44×44 minimum target.</done>
  <commit>fix(a11y): enforce touch target baseline</commit>
</task>

<task id="10" depends="9" type="auto">
  <name>Associate extra simulation labels for Craps, Dragon Tiger, and San Gong</name>
  <files>
    <modify>src/games/craps/components/CrapsSimulation.tsx</modify>
    <modify>src/games/dragontiger/components/DTSimulation.tsx</modify>
    <modify>src/games/sangong/components/SGSimulation.tsx</modify>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
  </files>
  <read_first>
    tests/e2e/traditional-games-accessibility.spec.ts
    src/components/SimulationPanel/SimulationPanel.tsx
  </read_first>
  <action>Give each game-specific 加注策略 select a stable id and connect its existing visible label with `htmlFor`. Keep values and onChange behavior unchanged.</action>
  <test_code>For the three routes in simulation mode, `getByLabel('加注策略:')` finds exactly one select and Axe reports no `label` violation.</test_code>
  <verify>`npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "simulation labels"` — the first three cases pass.</verify>
  <done>Craps, Dragon Tiger, and San Gong simulation selects have associated visible labels.</done>
  <commit>fix(a11y): associate card and craps simulation labels</commit>
</task>

<task id="11" depends="10" type="auto">
  <name>Associate extra simulation labels for Sic Bo and Slots</name>
  <files>
    <modify>src/games/sicbo/components/SicBoSimulation.tsx</modify>
    <modify>src/games/slots/components/SlotSimulation.tsx</modify>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
  </files>
  <read_first>
    tests/e2e/traditional-games-accessibility.spec.ts
    src/components/SimulationPanel/SimulationPanel.tsx
  </read_first>
  <action>Associate Sic Bo's 加注策略 label and Slots' 赔付线数 label with stable control ids. Keep values, bounds, and onChange behavior unchanged.</action>
  <test_code>In simulation mode, `getByLabel('加注策略:')` and `getByLabel('赔付线数:')` each find exactly one control and Axe reports no `label` violation.</test_code>
  <verify>`npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts -g "simulation labels"` — all five cases pass.</verify>
  <done>All game-specific simulation selects and inputs have associated visible labels.</done>
  <commit>fix(a11y): associate sic bo and slot simulation labels</commit>
</task>

<task id="12" depends="" type="auto">
  <name>Replace source-string bet safety tests with behavior tests</name>
  <files>
    <create>src/games/logic/commitDebitedBet.ts</create>
    <test>src/games/BetPlacementSafety.test.ts</test>
    <modify>src/games/baccarat/hooks/useBaccaratGame.ts</modify>
    <modify>src/games/roulette/hooks/useRouletteGame.ts</modify>
  </files>
  <read_first>
    src/hooks/usePersistedBalance.ts
    src/games/BetPlacementSafety.test.ts
    src/games/baccarat/hooks/useBaccaratGame.ts
    src/games/roulette/hooks/useRouletteGame.ts
  </read_first>
  <action>
    Add `commitDebitedBet(amount, debit, commit): boolean`: return false without calling commit when debit rejects; call commit exactly once and return true when debit succeeds. Route both hooks through it. Replace all `readFileSync/indexOf` assertions with callback behavior tests, including invalid/insufficient debit, successful debit, and no-bet settlement guards through exported pure predicates where required.
  </action>
  <test_code>
    Import the Baccarat and Roulette placement adapters from their hook modules so the test fails if either hook is no longer wired through `commitDebitedBet`.
    For each adapter: a debit callback returning false leaves the bet collection unchanged and invokes commit zero times; a callback returning true invokes debit once and commit exactly once with the requested amount/type/value.
    For each settlement predicate: an empty/zero-stake bet collection returns false and prevents random result generation, payout credit, and phase mutation.
  </test_code>
  <verify>`npm test -- --run src/games/BetPlacementSafety.test.ts` — passes and the test contains no filesystem/source-string reads.</verify>
  <done>Bet safety is verified through executed debit/commit behavior in both hooks.</done>
  <commit>test(games): replace source-string bet safety checks</commit>
</task>

<task id="13" depends="" type="auto">
  <name>Make OpenFootball tests assert RequestInit</name>
  <files>
    <test>src/dataProviders/football/openFootballProvider.test.ts</test>
    <modify>src/dataProviders/football/openFootballProvider.ts</modify>
  </files>
  <read_first>
    src/dataProviders/football/openFootballProvider.test.ts
    src/dataProviders/football/openFootballProvider.ts
  </read_first>
  <action>Change fetch mocks to `(input: RequestInfo | URL, init?: RequestInit)`. Assert every network request carries `cache: 'no-store'` and an AbortSignal. Do not weaken or remove the production request options; only adjust production code if needed to expose a stable request-init helper.</action>
  <test_code>
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({ cache: 'no-store' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  </test_code>
  <verify>`npm test -- --run src/dataProviders/football/openFootballProvider.test.ts` — passes.</verify>
  <done>A cache-policy or abort-signal regression now fails the provider tests.</done>
  <commit>test(data): assert OpenFootball request options</commit>
</task>

<task id="14" depends="11" type="auto">
  <name>Complete eight-game Axe and keyboard journeys</name>
  <files>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
    <test>tests/e2e/smoke.spec.ts</test>
  </files>
  <read_first>
    tests/e2e/traditional-games-accessibility.spec.ts
    tests/e2e/rules-modal-accessibility.spec.ts
    tests/e2e/world-cup-public-data.spec.ts
  </read_first>
  <action>Parameterize zero-violation Axe scans across all eight canonical game routes in both game and simulation modes. Add keyboard journeys for every custom input and primary action, the full roulette bet flow, one status update per game, reduced motion, and 390×844 touch boxes. Update smoke selectors to accessible labels. Keep retries disabled and fail on page errors.</action>
  <test_code>
    for (const game of games) {
      await page.goto(game.route);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.getByRole('button', { name: '模拟测试' }).click();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  </test_code>
  <verify>
    `npm exec playwright test tests/e2e/traditional-games-accessibility.spec.ts tests/e2e/smoke.spec.ts` — passes.
    `npm run test:e2e` — all tests pass.
  </verify>
  <done>All eight games have Axe, keyboard, live-status, reduced-motion, and touch regression coverage.</done>
  <commit>test(a11y): cover every traditional game journey</commit>
</task>

<task id="15" depends="" type="auto">
  <name>Configure Knip entrypoints and generate the exact export inventory</name>
  <files>
    <create>knip.json</create>
    <modify>package.json</modify>
    <modify>package-lock.json</modify>
    <test>src/architecture/knip-policy.test.ts</test>
  </files>
  <read_first>
    package.json
    vercel.json
    api/world-cup/data.ts
    api/world-cup/research.ts
  </read_first>
  <action>
    Run `npm install --save-dev knip` so both manifests record Knip as a devDependency. Configure entrypoints for `src/main.tsx`, `api/**/*.ts`, and `tests/e2e/**/*.ts`; add `check:dead-code` as `knip` and `report:dead-code` as `knip --reporter json`. Do not ignore exports/types and do not delete Vercel handlers. Generate the JSON inventory and record its exact file/symbol list in the Decision log. This task does not clean any reported export; all export edits belong to `2026-07-13-dead-code-export-remediation-implementation.md`.
  </action>
  <test_code>
    const config = JSON.parse(readFileSync('knip.json', 'utf8'));
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(config.entry).toEqual(expect.arrayContaining(['src/main.tsx', 'api/**/*.ts', 'tests/e2e/**/*.ts']));
    expect(pkg.devDependencies.knip).toBeDefined();
    expect(pkg.scripts['report:dead-code']).toBe('knip --reporter json');
  </test_code>
  <verify>
    `npm test -- --run src/architecture/knip-policy.test.ts` — passes.
    `npm run report:dead-code` — exits non-zero while emitting the expected unused export/type inventory; this non-zero result is the RED baseline, not a task failure.
    Inspect the JSON output — Vercel handlers are absent from `files`, and all remaining items are copied to the D-plan inventory.
  </verify>
  <done>Knip is locked and policy-tested, false-positive entrypoints are configured, and the non-zero export inventory is recorded for the D plan.</done>
  <commit>chore(quality): configure knip inventory</commit>
</task>

<task id="16" depends="" type="auto">
  <name>Split the two largest World Cup test suites by capability</name>
  <files>
    <test>src/modules/sports/football/worldCup/domain/buildWorldCupDomain.intelligence.test.ts</test>
    <test>src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts</test>
    <test>src/modules/sports/football/worldCup/backtest/worldCupBacktest.readiness.test.ts</test>
    <test>src/modules/sports/football/worldCup/backtest/worldCupBacktest.test.ts</test>
    <create>src/modules/sports/football/worldCup/testFixtures.ts</create>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts
    src/modules/sports/football/worldCup/backtest/worldCupBacktest.test.ts
  </read_first>
  <action>
    Move shared builders only into `testFixtures.ts`. Move external-intelligence/market/reliability cases into the new domain suite and readiness/coverage/sample-building cases into the new backtest suite. Preserve every test name and assertion; do not export test helpers through production barrels. Target each original file below 650 lines without weakening coverage.
  </action>
  <test_code>The existing test bodies are the safety net: before moving, record the two files' test count; after moving, the combined four suites must report the identical count and names.</test_code>
  <verify>
    `npm test -- --run src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts src/modules/sports/football/worldCup/domain/buildWorldCupDomain.intelligence.test.ts src/modules/sports/football/worldCup/backtest/worldCupBacktest.test.ts src/modules/sports/football/worldCup/backtest/worldCupBacktest.readiness.test.ts` — passes with unchanged test count.
    `wc -l src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts src/modules/sports/football/worldCup/backtest/worldCupBacktest.test.ts` — both reported counts are below 650.
  </verify>
  <done>Both giant suites are split by behavior, share test-only fixtures, and retain all assertions.</done>
  <commit>refactor(tests): split World Cup capability suites</commit>
</task>

<task id="17" depends="1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16" type="auto">
  <name>Run the complete accessibility and maintenance quality gate</name>
  <files>
    <test>tests/e2e/traditional-games-accessibility.spec.ts</test>
    <test>src/games/BetPlacementSafety.test.ts</test>
    <test>src/dataProviders/football/openFootballProvider.test.ts</test>
  </files>
  <read_first>
    package.json
    knip.json
    tests/e2e/traditional-games-accessibility.spec.ts
  </read_first>
  <action>Run the complete repository gate without changing production behavior. Preserve the non-zero Knip export inventory for the D plan; all other commands must pass. Review `git diff --check` before handing off.</action>
  <test_code>This is a verification-only task; Tasks 1–16 provide the tests. Do not add snapshots or weaken assertions to make the gate pass.</test_code>
  <verify>
    `npm run typecheck` — exits 0.
    `npm run lint` — exits 0.
    `npm test` — all Vitest suites pass.
    `npm run build` — exits 0 and build budgets pass.
    `npm run test:e2e` — all Playwright suites pass.
    `npm run report:dead-code` — exits non-zero only for the D-plan export/type inventory; no unused files, dependencies, or unresolved imports.
    `git diff --check` — no whitespace errors.
  </verify>
  <done>All C-plan behavior gates pass and only the explicitly handed-off D-plan Knip inventory remains non-zero.</done>
  <commit>test(quality): verify accessibility remediation gate</commit>
</task>

## Decision log

- 2026-07-14 — Baseline `8332a25` remains an ancestor. The completed runtime plan changed
  `tests/e2e/smoke.spec.ts`, Playwright's inert Supabase defaults, build-chunk naming, and
  the World Cup domain suites; accessibility tasks preserve those stronger runtime gates
  while adding the eight-game harness and later splitting the expanded domain tests.
- 2026-07-14 — Locked Knip 6.26.0 with `src/main.tsx`, `api/**/*.ts`, and
  `tests/e2e/**/*.ts` as explicit entries. The exact JSON inventory is 46 unused exports,
  97 unused exported types, two duplicate groups, zero unused files, zero dependency
  findings, and zero unresolved imports across 46 production files. The complete baseline
  file/symbol inventory remains embedded in D tasks 1–11; plan drift adds exactly
  `src/server/worldCup/strategyResearchEndpoint.ts:HISTORICAL_RESULTS_URLS`,
  `src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts:WorldCupDomainRefreshCoordinator`,
  and `src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts:WorldCupStrategyResearchProvenance`,
  now recorded in D task 12. All six `api/world-cup/*.ts` handlers, including
  `client-telemetry.ts` and `telemetry-retention.ts`, are entrypoints and are absent from
  the Knip issue inventory.
