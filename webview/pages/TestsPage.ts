/**
 * TestsPage — build declarative tests (assertions + extractions) for the
 * current request, run them, and browse past runs.
 *
 * Security model: assertions are structured data; no user scripts execute.
 */
import { h, icon, clear } from '../components/dom';
import { emptyState, loadingInline } from '../components/Loading';
import { button, iconButton, pageHeader, checkbox, formatTime, formatDuration } from '../components/ui';
import { Modal, confirmDialog, promptDialog } from '../components/Modal';
import type { Page } from './types';
import { state } from '../state/AppState';
import { ensureDraft, updateDraft, setTests } from '../state/RequestState';
import { navigate } from '../state/NavigationState';
import { TestService } from '../services/TestService';
import type {
  AssertionDefinition,
  AssertionOperator,
  TestDefinition,
  TestRunHistoryEntry,
  TestRunResult,
} from '../../src/types/Testing';

type AssertionType = AssertionDefinition['type'];

const OPERATORS_BY_TYPE: Record<AssertionType, AssertionOperator[]> = {
  status: ['equals', 'notEquals', 'lt', 'lte', 'gt', 'gte'],
  responseTime: ['lt', 'lte', 'gt', 'gte'],
  body: ['contains', 'notContains', 'equals', 'matches', 'exists', 'notExists'],
  header: ['exists', 'notExists', 'equals', 'contains', 'matches'],
  jsonPath: ['equals', 'notEquals', 'contains', 'notContains', 'matches', 'exists', 'notExists', 'lt', 'lte', 'gt', 'gte'],
};

const TYPE_LABELS: Record<AssertionType, string> = {
  status: 'Status code',
  responseTime: 'Response time',
  body: 'Response body',
  header: 'Response header',
  jsonPath: 'JSON path',
};

class TestsPage implements Page {
  readonly id = 'tests' as const;

  private container: HTMLElement | null = null;
  private listRoot: HTMLElement | null = null;
  private historyRoot: HTMLElement | null = null;
  private lastRun: TestRunResult | null = null;
  private running = false;
  private readonly unsub: Array<() => void> = [];

  render(container: HTMLElement): void {
    if (this.container !== container) {
      this.container = container;
      this.build(container);
      this.unsub.push(
        state.on('tests', () => {
          this.renderList();
          this.renderRunResult();
        }),
        state.on('request', () => this.renderList()),
      );
    }
    this.renderList();
    this.renderRunResult();
    void this.loadHistory();
  }

  dispose(): void {
    for (const unsub of this.unsub) unsub();
    this.unsub.length = 0;
    this.container = null;
  }

  private build(container: HTMLElement): void {
    container.className = 'gc-page';
    this.listRoot = h('div');
    this.historyRoot = h('div');

    clear(container);
    container.append(
      pageHeader(
        'Tests',
        'Assert on status, timing, headers, body content and JSON paths — no scripts, no side effects.',
        [
          button('Run now', { variant: 'primary', iconName: 'play', onClick: () => void this.run() }),
          button('Save', { iconName: 'save', onClick: () => void this.save() }),
        ],
      ),
      h('div', { className: 'gc-card' },
        h('div', { className: 'gc-card-title' },
          h('span', { text: 'Tests for the current request' }),
          h('span', { className: 'gc-chip', text: ensureDraft().name })),
        this.listRoot),
      h('div', { className: 'gc-card' },
        h('div', { className: 'gc-card-title' },
          h('span', { text: 'Run results' })),
        h('div', { id: 'gc-run-result' })),
      h('div', { className: 'gc-card' },
        h('div', { className: 'gc-card-title' },
          h('span', { text: 'Run history' }),
          button('Refresh', { size: 'sm', iconName: 'refresh', onClick: () => void this.loadHistory() })),
        this.historyRoot),
    );
  }

  // --- test list --------------------------------------------------------

  private renderList(): void {
    if (!this.listRoot) return;
    clear(this.listRoot);

    const draft = ensureDraft();
    const tests = draft.tests ?? [];

    if (tests.length === 0) {
      this.listRoot.appendChild(
        emptyState(
          'flask',
          'No tests yet',
          'Add your first assertion — e.g. "status equals 200" — and it will run after every send.',
          button('Add test', { variant: 'primary', iconName: 'plus', onClick: () => void this.addTest() }),
        ),
      );
      return;
    }

    for (const test of tests) {
      this.listRoot.appendChild(this.renderTestCard(test));
    }

    this.listRoot.appendChild(
      h('div', { className: 'gc-row', style: { marginTop: '10px' } },
        button('Add test', { size: 'sm', iconName: 'plus', onClick: () => void this.addTest() }),
        h('span', { className: 'gc-spacer' }),
        h('span', { className: 'gc-dim gc-small', text: `${tests.length} test(s) · ${tests.reduce((n, t) => n + t.assertions.length, 0)} assertion(s)` })),
    );
  }

  private renderTestCard(test: TestDefinition): HTMLElement {
    const card = h('div', { className: 'gc-test-result', style: { marginBottom: '10px' } });

    const head = h(
      'div',
      { className: 'gc-test-result-head', style: { color: test.enabled ? 'var(--gc-text)' : 'var(--gc-text-dim)' } },
      icon('flask'),
      h('span', { text: test.name }),
      h('span', { className: 'gc-spacer' }),
      h('span', { className: 'gc-chip', text: `${test.assertions.length} assertions` }),
      checkbox('Enabled', test.enabled, (value) => {
        updateDraft((d) => {
          const target = d.tests?.find((t) => t.id === test.id);
          if (target) target.enabled = value;
        });
        this.renderList();
      }),
      iconButton('copy', 'Duplicate test', () => void this.duplicateTest(test)),
      iconButton('trash', 'Delete test', () => void this.deleteTest(test), 'danger'),
    );
    card.appendChild(head);

    const body = h('div', { className: 'gc-test-assertions' });
    for (const assertion of test.assertions) {
      body.appendChild(this.renderAssertionRow(test, assertion));
    }
    if (test.extractions) {
      for (const extraction of test.extractions) {
        body.appendChild(
          h('div', { className: 'gc-assertion passed' },
            icon('download'),
            h('span', { className: 'desc', text: `Extract {{${extraction.name}}} from ${extraction.source}${extraction.path ? ` (${extraction.path})` : extraction.header ? ` (${extraction.header})` : ''}` }),
            iconButton('x', 'Remove extraction', () => void this.removeExtraction(test, extraction.name))),
        );
      }
    }
    body.appendChild(
      h('div', { className: 'gc-row', style: { marginTop: '6px', gap: '6px', flexWrap: 'wrap' } },
        button('Add assertion', { size: 'sm', iconName: 'plus', onClick: () => void this.addAssertion(test) }),
        button('Add extraction', { size: 'sm', iconName: 'download', onClick: () => void this.addExtraction(test) })),
    );
    card.appendChild(body);
    return card;
  }

  private renderAssertionRow(test: TestDefinition, assertion: AssertionDefinition): HTMLElement {
    const label = describeAssertion(assertion);
    return h(
      'div',
      { className: 'gc-assertion' },
      icon('check'),
      h('span', { className: 'desc', text: label }),
      h('span', { className: 'gc-spacer' }),
      iconButton('trash', 'Remove assertion', () => void this.removeAssertion(test, assertion)),
    );
  }

  // --- mutations --------------------------------------------------------

  private async addTest(): Promise<void> {
    const name = await promptDialog('New test', 'Test name', '', 'Status Code is 200');
    if (!name) return;
    const test: TestDefinition = {
      id: `tst_${Date.now().toString(36)}`,
      name,
      enabled: true,
      assertions: [{ type: 'status', operator: 'equals', value: 200 }],
    };
    setTests([...(ensureDraft().tests ?? []), test]);
    this.renderList();
  }

  private async duplicateTest(test: TestDefinition): Promise<void> {
    const clone: TestDefinition = {
      ...structuredClone(test),
      id: `tst_${Date.now().toString(36)}`,
      name: `${test.name} (copy)`,
    };
    setTests([...(ensureDraft().tests ?? []), clone]);
    this.renderList();
  }

  private async deleteTest(test: TestDefinition): Promise<void> {
    const confirmed = await confirmDialog('Delete test', `Delete "${test.name}"?`, 'Delete', true);
    if (!confirmed) return;
    setTests((ensureDraft().tests ?? []).filter((t) => t.id !== test.id));
    this.renderList();
  }

  private async removeAssertion(test: TestDefinition, assertion: AssertionDefinition): Promise<void> {
    updateDraft((d) => {
      const target = d.tests?.find((t) => t.id === test.id);
      if (target) target.assertions = target.assertions.filter((a) => a !== assertion);
    });
    this.renderList();
  }

  private async removeExtraction(test: TestDefinition, name: string): Promise<void> {
    updateDraft((d) => {
      const target = d.tests?.find((t) => t.id === test.id);
      if (target) target.extractions = target.extractions?.filter((e) => e.name !== name);
    });
    this.renderList();
  }

  /** Multi-step dialog building one assertion. */
  private async addAssertion(test: TestDefinition): Promise<void> {
    const type = await pick('New assertion', 'What do you want to assert?', [
      ['status', 'Status code'],
      ['responseTime', 'Response time'],
      ['body', 'Response body'],
      ['header', 'Response header'],
      ['jsonPath', 'JSON path'],
    ]);
    if (!type) return;

    const operators = OPERATORS_BY_TYPE[type as AssertionType];
    const operator = await pick(
      'New assertion',
      'Comparison',
      operators.map((op) => [op, op] as [string, string]),
    );
    if (!operator) return;

    let assertion: AssertionDefinition | null = null;

    if (type === 'status') {
      const raw = await promptDialog('Status code assertion', 'Expected status code', '200');
      if (!raw) return;
      const value = Number(raw);
      if (!Number.isInteger(value)) {
        state.pushToast('warning', 'Status must be an integer.');
        return;
      }
      assertion = { type: 'status', operator: operator as never, value };
    } else if (type === 'responseTime') {
      const raw = await promptDialog('Response time assertion', 'Threshold (ms)', '500');
      if (!raw) return;
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        state.pushToast('warning', 'Threshold must be a number.');
        return;
      }
      assertion = { type: 'responseTime', operator: operator as never, value };
    } else if (type === 'body') {
      const needsValue = operator !== 'exists' && operator !== 'notExists';
      const raw = needsValue ? await promptDialog('Body assertion', `Value to ${operator}`, '') : '';
      if (needsValue && raw === null) return;
      assertion = { type: 'body', operator: operator as never, value: raw ?? '' };
    } else if (type === 'header') {
      const header = await promptDialog('Header assertion', 'Header name', '', 'content-type');
      if (!header) return;
      const needsValue = operator !== 'exists' && operator !== 'notExists';
      const raw = needsValue ? await promptDialog('Header assertion', `Value to ${operator}`, '') : '';
      if (needsValue && raw === null) return;
      assertion = { type: 'header', header, operator: operator as never, ...(needsValue ? { value: raw ?? '' } : {}) };
    } else {
      const path = await promptDialog('JSON path assertion', 'Path (e.g. $.data[0].id)', '$.');
      if (!path) return;
      const needsValue = operator !== 'exists' && operator !== 'notExists';
      const raw = needsValue ? await promptDialog('JSON path assertion', 'Expected value', '') : '';
      if (needsValue && raw === null) return;
      assertion = { type: 'jsonPath', path, operator: operator as never, ...(needsValue ? { value: raw ?? '' } : {}) };
    }

    if (!assertion) return;
    updateDraft((d) => {
      const target = d.tests?.find((t) => t.id === test.id);
      if (target) target.assertions.push(assertion!);
    });
    this.renderList();
  }

  private async addExtraction(test: TestDefinition): Promise<void> {
    const source = await pick('New extraction', 'Extract from', [
      ['jsonPath', 'JSON path'],
      ['header', 'Response header'],
      ['status', 'Status code'],
    ]);
    if (!source) return;

    const name = await promptDialog('New extraction', 'Variable name', '', 'auth_token');
    if (!name) return;

    updateDraft((d) => {
      const target = d.tests?.find((t) => t.id === test.id);
      if (!target) return;
      target.extractions = target.extractions ?? [];
      const base = { type: 'extract' as const, name, scope: 'environment' as const };
      if (source === 'jsonPath') {
        target.extractions.push({ ...base, source: 'jsonPath', path: '$.data.token' });
      } else if (source === 'header') {
        target.extractions.push({ ...base, source: 'header', header: 'x-request-id' });
      } else {
        target.extractions.push({ ...base, source: 'status' });
      }
    });
    this.renderList();
  }

  // --- run / save -------------------------------------------------------

  private async save(): Promise<void> {
    const draft = ensureDraft();
    try {
      const result = await TestService.save(draft.id, draft.tests ?? []);
      setTests(result.tests);
      if (result.warnings.length > 0) {
        state.pushToast('warning', result.warnings[0]);
      } else {
        state.pushToast('success', 'Tests saved.');
      }
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async run(): Promise<void> {
    if (this.running) return;
    const draft = ensureDraft();
    if (!draft.tests || draft.tests.length === 0) {
      state.pushToast('warning', 'Add at least one test before running.');
      return;
    }
    if (!draft.url.trim()) {
      state.pushToast('warning', 'The request needs a URL before tests can run.');
      navigate('requests');
      return;
    }

    this.running = true;
    this.renderRunResult();
    try {
      await this.save();
      const result = await TestService.run(draft.id, draft);
      this.lastRun = result.testRun ?? null;
      if (result.testRun) {
        state.testRun = result.testRun;
        state.emit('tests');
      }
      const summary = result.testRun?.summary;
      if (summary) {
        state.pushToast(
          summary.failed > 0 ? 'error' : 'success',
          `${summary.passed}/${summary.total} assertions passed in ${result.testRun!.responseTime} ms.`,
        );
      } else {
        state.pushToast('info', 'Request completed without test results.');
      }
      await this.loadHistory();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      this.running = false;
      this.renderRunResult();
    }
  }

  private renderRunResult(): void {
    const root = this.container?.querySelector('#gc-run-result');
    if (!root) return;
    clear(root as HTMLElement);

    if (this.running) {
      (root as HTMLElement).appendChild(loadingInline('Running request and tests…'));
      return;
    }

    const run = this.lastRun ?? state.testRun;
    if (!run) {
      (root as HTMLElement).appendChild(
        emptyState('play', 'No run yet', 'Press "Run now" to send the request and evaluate its assertions.'),
      );
      return;
    }

    const element = renderRunSummary(run);
    (root as HTMLElement).appendChild(element);
  }

  private async loadHistory(): Promise<void> {
    if (!this.historyRoot) return;
    try {
      const result = await TestService.history(20);
      clear(this.historyRoot);
      if (result.runs.length === 0) {
        this.historyRoot.appendChild(
          h('p', { className: 'gc-dim gc-small', text: 'No runs recorded yet.' }),
        );
        return;
      }
      this.historyRoot.appendChild(
        h(
          'div',
          { className: 'gc-table-wrap' },
          h(
            'table',
            { className: 'gc-table' },
            h('thead', null,
              h('tr', null,
                h('th', { text: 'When' }),
                h('th', { text: 'Request' }),
                h('th', { text: 'Source' }),
                h('th', { text: 'Passed' }),
                h('th', { text: 'Failed' }),
                h('th', { text: 'Total' }),
                h('th', { text: 'Duration' }))),
            h('tbody', null, ...result.runs.map((run) => this.renderHistoryRow(run))),
          ),
        ),
      );
    } catch (error) {
      clear(this.historyRoot);
      this.historyRoot.appendChild(
        h('p', { className: 'gc-muted gc-small', text: `Could not load run history: ${error instanceof Error ? error.message : String(error)}` }),
      );
    }
  }

  private renderHistoryRow(run: TestRunHistoryEntry): HTMLElement {
    return h(
      'tr',
      { className: 'clickable', on: { click: () => { this.lastRun = run; this.renderRunResult(); } } },
      h('td', { className: 'cell-muted cell-nowrap', text: formatTime(run.timestamp) }),
      h('td', { className: 'cell-ellipsis', text: run.requestName }),
      h('td', { className: 'cell-muted', text: run.source }),
      h('td', { className: 'num', style: { color: 'var(--gc-success)' }, text: String(run.summary.passed) }),
      h('td', { className: 'num', style: { color: run.summary.failed > 0 ? 'var(--gc-error)' : 'inherit' }, text: String(run.summary.failed) }),
      h('td', { className: 'num', text: String(run.summary.total) }),
      h('td', { className: 'cell-mono cell-muted', text: formatDuration(run.responseTime) }),
    );
  }
}

// --- helpers -------------------------------------------------------------

function describeAssertion(assertion: AssertionDefinition): string {
  switch (assertion.type) {
    case 'status':
      return `Status code ${assertion.operator} ${assertion.value}`;
    case 'responseTime':
      return `Response time ${assertion.operator} ${assertion.value} ms`;
    case 'body':
      return `Body ${assertion.operator} "${assertion.value.slice(0, 60)}"`;
    case 'header':
      return `Header "${assertion.header}" ${assertion.operator}${assertion.value !== undefined ? ` "${assertion.value}"` : ''}`;
    case 'jsonPath':
      return `JSON ${assertion.path} ${assertion.operator}${assertion.value !== undefined ? ` ${String(assertion.value)}` : ''}`;
    default:
      return 'Assertion';
  }
}

function renderRunSummary(run: TestRunResult): HTMLElement {
  const wrap = h('div');
  wrap.appendChild(
    h('div', { className: 'gc-row', style: { marginBottom: '10px', gap: '8px', flexWrap: 'wrap' } },
      h('span', { className: `gc-chip ${run.summary.failed > 0 ? 'error' : 'success'}`,
        text: `${run.summary.passed}/${run.summary.total} passed` }),
      run.summary.failed > 0
        ? h('span', { className: 'gc-chip error', text: `${run.summary.failed} failed` })
        : h('span'),
      run.summary.skipped > 0 ? h('span', { className: 'gc-chip warning', text: `${run.summary.skipped} skipped` }) : h('span'),
      h('span', { className: 'gc-muted gc-small', text: `${run.requestName} · ${run.timestamp} · ${run.responseTime} ms` })),
  );

  for (const test of run.results) {
    const card = h('div', { className: `gc-test-result ${test.status}`, style: { marginBottom: '8px' } });
    card.appendChild(
      h('div', { className: 'gc-test-result-head' },
        icon(test.status === 'passed' ? 'check' : test.status === 'failed' ? 'x' : 'warn'),
        h('span', { text: test.name })),
    );
    const list = h('div', { className: 'gc-test-assertions' });
    for (const assertion of test.assertions) {
      list.appendChild(
        h('div', { className: `gc-assertion ${assertion.status}` },
          icon(assertion.status === 'passed' ? 'check' : assertion.status === 'failed' ? 'x' : 'warn'),
          h('span', { className: 'desc', text: assertion.description }),
          assertion.message ? h('span', { className: 'detail', text: assertion.message }) : h('span')),
      );
    }
    for (const extraction of test.extractions) {
      list.appendChild(
        h('div', { className: `gc-assertion ${extraction.status}` },
          icon(extraction.status === 'passed' ? 'check' : 'x'),
          h('span', { className: 'desc', text: `extract ${extraction.name}` }),
          h('span', { className: 'detail', text: extraction.value ?? extraction.message ?? '' })),
      );
    }
    card.appendChild(list);
    wrap.appendChild(card);
  }
  return wrap;
}

/** Simple quick-pick dialog returning the chosen value (or null). */
function pick(title: string, label: string, options: Array<[string, string]>): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let modal: Modal | null = null;
    const select = h(
      'select',
      { className: 'gc-select', attrs: { 'aria-label': label } },
      ...options.map(([value, text]) => h('option', { value, text })),
    ) as HTMLSelectElement;

    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      modal?.close();
    };

    const cancel = button('Cancel', { onClick: () => finish(null) });
    const next = button('Continue', { variant: 'primary', onClick: () => finish(select.value) });

    modal = new Modal({
      title,
      body: h('div', { className: 'gc-field' }, h('label', { className: 'gc-label', text: label }), select),
      footer: [cancel, next],
      onClose: () => finish(null),
    });
    modal.open();
    select.focus();
  });
}

export const testsPage = new TestsPage();
