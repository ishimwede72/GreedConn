/**
 * RequestPage — the request builder (URL bar, params/headers/body/auth) and
 * the response viewer (Pretty/Raw/Preview/Headers/Tests).
 *
 * The page builds its DOM once per request identity and updates targeted
 * regions afterwards so typing never loses focus.
 */
import { h, icon, clear } from '../components/dom';
import { KeyValueEditor } from '../components/KeyValueEditor';
import { CodeEditor } from '../components/CodeEditor';
import { JsonViewer } from '../components/JsonViewer';
import { Tabs } from '../components/Tabs';
import { emptyState, spinner } from '../components/Loading';
import {
  button,
  field,
  formatDuration,
  formatSize,
  statusBadge,
} from '../components/ui';
import type { Page } from './types';
import { state } from '../state/AppState';
import { ensureDraft, updateDraft, setRequest, setResponse, newRequestId } from '../state/RequestState';
import { navigate } from '../state/NavigationState';
import { bridge } from '../services/VsCodeBridge';
import { RequestService } from '../services/RequestService';
import { EnvironmentService } from '../services/EnvironmentService';
import type {
  HttpRequestModel,
  HttpMethod,
  KeyValueRow,
  AuthConfig,
  OAuth2Auth,
} from '../../src/types/Request';
import type { HttpResponseModel } from '../../src/types/Response';
import type { TestRunResult } from '../../src/types/Testing';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

type BuilderTab = 'params' | 'headers' | 'body' | 'auth' | 'tests';
type ResponseTab = 'pretty' | 'raw' | 'preview' | 'headers' | 'tests';

class RequestPage implements Page {
  readonly id = 'requests' as const;

  private container: HTMLElement | null = null;
  private builtForId: string | null = null;

  private urlInput!: HTMLInputElement;
  private methodSelect!: HTMLSelectElement;
  private sendButton!: HTMLButtonElement;
  private cancelButton!: HTMLButtonElement;
  private builderBody!: HTMLElement;
  private responseRoot!: HTMLElement;
  private paramsEditor: KeyValueEditor | null = null;
  private headersEditor: KeyValueEditor | null = null;
  private bodyEditor: CodeEditor | null = null;
  private builderTabs: Tabs | null = null;
  private responseTabs: Tabs | null = null;
  private activeBuilderTab: BuilderTab = 'params';
  private activeResponseTab: ResponseTab = 'pretty';
  private readonly unsub: Array<() => void> = [];

  render(container: HTMLElement): void {
    const draft = ensureDraft();
    if (this.container !== container || this.builtForId !== draft.id) {
      this.container = container;
      this.builtForId = draft.id;
      this.build(container, draft);
    } else {
      this.syncUrlBar(draft);
    }
    this.renderResponse();
  }

  dispose(): void {
    for (const unsub of this.unsub) unsub();
    this.unsub.length = 0;
    this.container = null;
    this.builtForId = null;
  }

  // --- construction -----------------------------------------------------

  private build(container: HTMLElement, draft: HttpRequestModel): void {
    container.className = 'gc-page tight';
    for (const unsub of this.unsub) unsub();
    this.unsub.length = 0;

    clear(container);
    container.appendChild(this.renderUrlBar(draft));

    const builder = h('div', { className: 'gc-request-builder' });
    this.builderBody = h('div', { className: 'gc-builder-body', style: { padding: '14px 16px' } });
    this.builderTabs = new Tabs({
      tabs: [
        { id: 'params', label: 'Params', count: draft.params.length },
        { id: 'headers', label: 'Headers', count: draft.headers.length },
        { id: 'body', label: 'Body' },
        { id: 'auth', label: 'Auth' },
        { id: 'tests', label: 'Tests', count: draft.tests?.length ?? 0 },
      ],
      active: this.activeBuilderTab,
      onChange: (id) => {
        this.activeBuilderTab = id as BuilderTab;
        this.renderBuilder();
      },
    });
    builder.append(this.builderTabs.element(), this.builderBody);

    this.responseRoot = h('div', { className: 'gc-response' });
    container.append(builder, this.responseRoot);

    this.renderBuilder();
    this.syncUrlBar(draft);

    this.unsub.push(
      state.on('response', () => this.renderResponse()),
      state.on('tests', () => {
        this.builderTabs?.setActive(this.activeBuilderTab);
        if (this.activeBuilderTab === 'tests') this.renderBuilder();
      }),
    );
  }

  private renderUrlBar(draft: HttpRequestModel): HTMLElement {
    this.methodSelect = h(
      'select',
      {
        className: 'gc-select method',
        attrs: { 'aria-label': 'HTTP method' },
        on: {
          change: (event) => {
            const value = (event.currentTarget as HTMLSelectElement).value as HttpMethod;
            updateDraft((d) => {
              d.method = value;
            });
            this.renderMethodBadge();
          },
        },
      },
      ...METHODS.map((method) => h('option', { value: method, text: method, selected: method === draft.method })),
    ) as HTMLSelectElement;
    this.methodSelect.value = draft.method;

    this.urlInput = h('input', {
      className: 'gc-input url',
      attrs: {
        type: 'text',
        placeholder: 'https://api.example.com/v1/users?active=true',
        'aria-label': 'Request URL',
        spellcheck: 'false',
      },
      value: draft.url,
      on: {
        input: (event) => {
          const value = (event.currentTarget as HTMLInputElement).value;
          updateDraft((d) => {
            d.url = value;
          });
        },
        keydown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void this.send();
          }
        },
      },
    }) as HTMLInputElement;

    this.sendButton = button('Send', {
      variant: 'primary',
      iconName: 'send',
      onClick: () => void this.send(),
    });
    this.cancelButton = button('Cancel', {
      variant: 'danger',
      iconName: 'stop',
      onClick: () => void this.cancel(),
      disabled: true,
    });
    this.cancelButton.style.display = 'none';

    const envSelect = this.renderEnvironmentSelect();

    return h(
      'div',
      { style: { padding: '14px 16px 10px' } },
      h(
        'div',
        { className: 'gc-urlbar' },
        this.methodSelect,
        this.urlInput,
        envSelect,
        this.sendButton,
        this.cancelButton,
        h(
          'button',
          {
            className: 'gc-btn icon-only',
            attrs: { type: 'button', title: 'New request', 'aria-label': 'New request' },
            on: {
              click: () => {
                setRequest(createFreshRequest());
                this.builtForId = null;
                if (this.container) this.render(this.container);
              },
            },
          },
          icon('plus'),
        ),
      ),
      h(
        'div',
        { className: 'gc-row', style: { marginTop: '8px', gap: '10px' } },
        h('span', { className: 'gc-muted gc-small', text: 'Draft saved automatically · Ctrl+Enter to send' }),
      ),
    );
  }

  private renderEnvironmentSelect(): HTMLElement {
    const select = h(
      'select',
      {
        className: 'gc-select',
        attrs: { 'aria-label': 'Environment', title: 'Active environment' },
        on: {
          change: (event) => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            state.activeEnvironmentId = value;
            void EnvironmentServiceSetActive(value);
          },
        },
      },
      h('option', { value: '', text: 'No environment' }),
      ...state.environments.map((environment) =>
        h('option', {
          value: environment.id,
          text: environment.name,
          selected: environment.id === state.activeEnvironmentId,
        }),
      ),
    );
    select.value = state.activeEnvironmentId;
    return select;
  }

  private renderMethodBadge(): void {
    // Keep select in sync; badge lives inside the select itself.
    this.methodSelect.value = ensureDraft().method;
  }

  private syncUrlBar(draft: HttpRequestModel): void {
    if (document.activeElement !== this.urlInput) this.urlInput.value = draft.url;
    if (document.activeElement !== this.methodSelect) this.methodSelect.value = draft.method;
  }

  // --- builder ----------------------------------------------------------

  private renderBuilder(): void {
    if (!this.builderBody) return;
    const draft = ensureDraft();
    clear(this.builderBody);

    switch (this.activeBuilderTab) {
      case 'params':
        this.paramsEditor = new KeyValueEditor({
          kind: 'params',
          rows: draft.params,
          keyPlaceholder: 'page',
          valuePlaceholder: '1',
          onChange: () => {
            updateDraft((d) => {
              d.params = this.paramsEditor ? [...this.paramsEditorRows()] : d.params;
            });
            this.builderTabs?.setActive(this.activeBuilderTab);
          },
        });
        this.builderBody.appendChild(
          h(
            'div',
            null,
            h('p', { className: 'gc-muted gc-small', style: { marginBottom: '10px' } },
              'Query parameters are appended to the URL automatically. Use {{variable}} for environment values.'),
            this.paramsEditor.element(),
          ),
        );
        break;

      case 'headers':
        this.headersEditor = new KeyValueEditor({
          kind: 'headers',
          rows: draft.headers,
          keyPlaceholder: 'Content-Type',
          valuePlaceholder: 'application/json',
          onChange: () => {
            updateDraft((d) => {
              d.headers = this.headersEditor ? [...this.headersEditorRows()] : d.headers;
            });
            this.builderTabs?.setActive(this.activeBuilderTab);
          },
        });
        this.builderBody.appendChild(
          h(
            'div',
            null,
            h('p', { className: 'gc-muted gc-small', style: { marginBottom: '10px' } },
              'Headers sent with every request. Restricted headers are sanitized before sending.'),
            this.headersEditor.element(),
          ),
        );
        break;

      case 'body':
        this.builderBody.appendChild(this.renderBodyPanel(draft));
        break;

      case 'auth':
        this.builderBody.appendChild(this.renderAuthPanel(draft));
        break;

      case 'tests':
        this.builderBody.appendChild(this.renderTestsPanel(draft));
        break;
    }
  }

  private paramsEditorRows(): KeyValueRow[] {
    return this.paramsEditor ? collectRows(this.paramsEditor) : [];
  }

  private headersEditorRows(): KeyValueRow[] {
    return this.headersEditor ? collectRows(this.headersEditor) : [];
  }

  private renderBodyPanel(draft: HttpRequestModel): HTMLElement {
    const type = draft.body.type;
    const typeSelect = h(
      'select',
      {
        className: 'gc-select',
        attrs: { 'aria-label': 'Body type', style: 'max-width: 220px' },
        on: {
          change: (event) => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            updateDraft((d) => {
              d.body.type = value as typeof d.body.type;
            });
            this.renderBuilder();
          },
        },
      },
      ...(['none', 'json', 'text', 'xml', 'formUrlEncoded', 'multipart'] as const).map((value) =>
        h('option', { value, text: bodyLabel(value), selected: value === type }),
      ),
    );
    typeSelect.value = type;

    const head = h('div', { className: 'gc-row', style: { marginBottom: '12px' } }, typeSelect);

    if (type === 'none') {
      return h(
        'div',
        null,
        head,
        h('p', { className: 'gc-muted gc-small', text: 'This request sends no body.' }),
      );
    }

    if (type === 'formUrlEncoded' || type === 'multipart') {
      const rows = (type === 'formUrlEncoded' ? draft.body.formParams : draft.body.multipartParts) ?? [];
      const editor = new KeyValueEditor({
        kind: 'params',
        rows: rows as KeyValueRow[],
        keyPlaceholder: 'field',
        valuePlaceholder: 'value',
        onChange: () => {
          const collected = collectRows(editor);
          updateDraft((d) => {
            if (type === 'formUrlEncoded') d.body.formParams = collected;
            else d.body.multipartParts = collected as never;
          });
        },
      });
      return h(
        'div',
        null,
        head,
        h('p', { className: 'gc-muted gc-small', style: { marginBottom: '10px' } },
          type === 'formUrlEncoded'
            ? 'Sent as application/x-www-form-urlencoded.'
            : 'Sent as multipart/form-data. File parts are declared with their file name in the description.'),
        editor.element(),
      );
    }

    // json / text / xml → code editor
    this.bodyEditor = new CodeEditor({
      value: draft.body.text ?? '',
      language: type === 'json' ? 'json' : 'text',
      placeholder: type === 'json' ? '{\n  "hello": "world"\n}' : 'Request body…',
      onChange: (value) => {
        updateDraft((d) => {
          d.body.text = value;
        });
      },
    });

    return h(
      'div',
      null,
      head,
      type === 'json'
        ? h('div', { className: 'gc-row', style: { marginBottom: '8px' } },
            button('Format', { size: 'sm', iconName: 'code', onClick: () => void this.bodyEditor?.format() }))
        : h('span'),
      this.bodyEditor.element(),
    );
  }

  private renderAuthPanel(draft: HttpRequestModel): HTMLElement {
    const auth = draft.authentication;
    const wrap = h('div');
    const typeSelect = h(
      'select',
      {
        className: 'gc-select',
        attrs: { 'aria-label': 'Auth type', style: 'max-width: 220px' },
        on: {
          change: (event) => {
            const value = (event.currentTarget as HTMLSelectElement).value as AuthConfig['type'];
            updateDraft((d) => {
              d.authentication = defaultAuthFor(value);
            });
            this.renderBuilder();
          },
        },
      },
      ...(
        [
          ['none', 'No Auth'],
          ['bearer', 'Bearer Token'],
          ['basic', 'Basic Auth'],
          ['apiKey', 'API Key'],
          ['oauth2', 'OAuth 2.0'],
        ] as Array<[AuthConfig['type'], string]>
      ).map(([value, label]) => h('option', { value, text: label, selected: value === auth.type })),
    );
    typeSelect.value = auth.type;

    wrap.appendChild(h('div', { className: 'gc-row', style: { marginBottom: '12px' } }, typeSelect));

    if (auth.type === 'none') {
      wrap.appendChild(h('p', { className: 'gc-muted gc-small', text: 'No authentication will be applied.' }));
      return wrap;
    }

    if (auth.type === 'bearer') {
      wrap.appendChild(
        field(
          'Token',
          h('input', {
            className: 'gc-input mono',
            attrs: { type: 'password', placeholder: 'eyJhbGciOi…', 'aria-label': 'Bearer token' },
            value: auth.token ?? '',
            on: {
              input: (event) => {
                const value = (event.currentTarget as HTMLInputElement).value;
                updateDraft((d) => {
                  if (d.authentication.type === 'bearer') d.authentication.token = value;
                });
              },
            },
          }),
        ),
      );
      wrap.appendChild(
        h('p', { className: 'gc-muted gc-small', text: 'Sent as: Authorization: Bearer <token>' }),
      );
      return wrap;
    }

    if (auth.type === 'basic') {
      wrap.appendChild(
        field(
          'Username',
          h('input', {
            className: 'gc-input',
            attrs: { type: 'text', autocomplete: 'off', 'aria-label': 'Username' },
            value: auth.username ?? '',
            on: {
              input: (event) => {
                const value = (event.currentTarget as HTMLInputElement).value;
                updateDraft((d) => {
                  if (d.authentication.type === 'basic') d.authentication.username = value;
                });
              },
            },
          }),
        ),
      );
      wrap.appendChild(
        field(
          'Password',
          h('input', {
            className: 'gc-input',
            attrs: { type: 'password', autocomplete: 'new-password', 'aria-label': 'Password' },
            value: auth.password ?? '',
            on: {
              input: (event) => {
                const value = (event.currentTarget as HTMLInputElement).value;
                updateDraft((d) => {
                  if (d.authentication.type === 'basic') d.authentication.password = value;
                });
              },
            },
          }),
        ),
      );
      return wrap;
    }

    if (auth.type === 'apiKey') {
      wrap.appendChild(
        field(
          'Key',
          h('input', {
            className: 'gc-input mono',
            attrs: { type: 'text', placeholder: 'X-API-Key', 'aria-label': 'API key name' },
            value: auth.key ?? '',
            on: {
              input: (event) => {
                const value = (event.currentTarget as HTMLInputElement).value;
                updateDraft((d) => {
                  if (d.authentication.type === 'apiKey') d.authentication.key = value;
                });
              },
            },
          }),
        ),
      );
      wrap.appendChild(
        field(
          'Value',
          h('input', {
            className: 'gc-input mono',
            attrs: { type: 'password', placeholder: 'secret-value', 'aria-label': 'API key value' },
            value: auth.value ?? '',
            on: {
              input: (event) => {
                const value = (event.currentTarget as HTMLInputElement).value;
                updateDraft((d) => {
                  if (d.authentication.type === 'apiKey') d.authentication.value = value;
                });
              },
            },
          }),
        ),
      );
      const placement = h(
        'select',
        {
          className: 'gc-select',
          attrs: { 'aria-label': 'Placement' },
          on: {
            change: (event) => {
              const value = (event.currentTarget as HTMLSelectElement).value as 'header' | 'query' | 'cookie';
              updateDraft((d) => {
                if (d.authentication.type === 'apiKey') d.authentication.placement = value;
              });
            },
          },
        },
        h('option', { value: 'header', text: 'In header' }),
        h('option', { value: 'query', text: 'In query parameter' }),
        h('option', { value: 'cookie', text: 'In cookie' }),
      );
      placement.value = auth.placement ?? 'header';
      wrap.appendChild(field('Placement', placement));
      return wrap;
    }

    // oauth2
    const grantSelect = h(
      'select',
      {
        className: 'gc-select',
        attrs: { 'aria-label': 'OAuth2 grant' },
        on: {
          change: (event) => {
            const value = (event.currentTarget as HTMLSelectElement).value as 'clientCredentials' | 'authorizationCodePkce';
            updateDraft((d) => {
              if (d.authentication.type === 'oauth2') d.authentication.grant = value;
            });
            this.renderBuilder();
          },
        },
      },
      h('option', { value: 'clientCredentials', text: 'Client Credentials' }),
      h('option', { value: 'authorizationCodePkce', text: 'Authorization Code + PKCE' }),
    );
    grantSelect.value = auth.grant ?? 'clientCredentials';
    wrap.appendChild(field('Grant type', grantSelect));

    wrap.appendChild(
      field(
        'Token URL',
        h('input', {
          className: 'gc-input mono',
          attrs: { type: 'text', placeholder: 'https://auth.example.com/oauth/token', 'aria-label': 'Token URL' },
          value: auth.tokenUrl ?? '',
          on: {
            input: (event) => {
              const value = (event.currentTarget as HTMLInputElement).value;
              updateDraft((d) => {
                if (d.authentication.type === 'oauth2') d.authentication.tokenUrl = value;
              });
            },
          },
        }),
      ),
    );
    wrap.appendChild(
      field(
        'Client ID',
        h('input', {
          className: 'gc-input mono',
          attrs: { type: 'text', autocomplete: 'off', 'aria-label': 'Client ID' },
          value: auth.clientId ?? '',
          on: {
            input: (event) => {
              const value = (event.currentTarget as HTMLInputElement).value;
              updateDraft((d) => {
                if (d.authentication.type === 'oauth2') d.authentication.clientId = value;
              });
            },
          },
        }),
      ),
    );
    wrap.appendChild(
      field(
        'Client secret',
        h('input', {
          className: 'gc-input',
          attrs: { type: 'password', autocomplete: 'new-password', 'aria-label': 'Client secret' },
          value: auth.clientSecret ?? '',
          on: {
            input: (event) => {
              const value = (event.currentTarget as HTMLInputElement).value;
              updateDraft((d) => {
                if (d.authentication.type === 'oauth2') d.authentication.clientSecret = value;
              });
            },
          },
        }),
      ),
    );
    wrap.appendChild(
      field(
        'Scope (optional)',
        h('input', {
          className: 'gc-input mono',
          attrs: { type: 'text', placeholder: 'read write', 'aria-label': 'Scope' },
          value: auth.scope ?? '',
          on: {
            input: (event) => {
              const value = (event.currentTarget as HTMLInputElement).value;
              updateDraft((d) => {
                if (d.authentication.type === 'oauth2') d.authentication.scope = value;
              });
            },
          },
        }),
      ),
    );

    const authorize = button('Authorize', {
      variant: 'primary',
      iconName: 'key',
      onClick: () => void this.authorize(),
    });
    const authActions = [authorize];
    if (auth.accessTokenSecretId || auth.refreshTokenSecretId) {
      authActions.push(
        button('Clear tokens', {
          size: 'sm',
          onClick: () => void this.clearOAuthTokens(),
        }),
      );
    }
    wrap.appendChild(
      h('div', { className: 'gc-row', style: { marginTop: '4px' } }, ...authActions),
    );
    wrap.appendChild(
      h('p', { className: 'gc-muted gc-small', style: { marginTop: '8px' } },
        'Tokens are stored in VS Code SecretStorage and never written to collections or history.'),
    );
    return wrap;
  }

  private renderTestsPanel(draft: HttpRequestModel): HTMLElement {
    const count = draft.tests?.length ?? 0;
    return h(
      'div',
      null,
      h('p', { className: 'gc-muted gc-small', style: { marginBottom: '12px' } },
        'Declarative assertions run automatically after this request completes.'),
      h(
        'div',
        { className: 'gc-card', style: { marginBottom: '12px' } },
        h('div', { className: 'gc-row' },
          icon('flask'),
          h('strong', { text: `${count} test(s) attached` }),
          h('span', { className: 'gc-spacer' }),
          button('Open Tests page', { size: 'sm', iconName: 'chevron', onClick: () => navigate('tests') }),
        ),
      ),
      count > 0
        ? h(
            'ul',
            { style: { margin: '0', paddingLeft: '18px', color: 'var(--gc-text-muted)', fontSize: '12.5px' } },
            ...draft.tests!.map((test) =>
              h('li', { style: { marginBottom: '4px' } },
                h('strong', { text: test.name }),
                h('span', { text: ` — ${test.assertions.length} assertion(s)` })),
            ),
          )
        : h('p', { className: 'gc-dim gc-small', text: 'No tests yet.' }),
    );
  }

  // --- sending ----------------------------------------------------------

  private async send(): Promise<void> {
    const draft = ensureDraft();
    if (!draft.url.trim()) {
      state.pushToast('warning', 'Enter a URL before sending.');
      this.urlInput.focus();
      return;
    }

    updateDraft((d) => {
      d.params = this.paramsEditorRows();
      d.headers = this.headersEditorRows();
      if (this.bodyEditor) d.body.text = this.bodyEditor.value;
    });

    state.runState = { running: true, startedAt: Date.now() };
    state.lastWarnings = [];
    this.setRunning(true);
    this.renderResponse();

    try {
      const result = await RequestService.send(ensureDraft(), state.activeEnvironmentId || undefined);
      updateDraft((current) => {
        current.authentication = result.authentication;
      });
      this.renderBuilder();
      setResponse(result.response);
      state.lastWarnings = result.warnings ?? [];
      if (result.testRun) {
        state.testRun = result.testRun;
        state.emit('tests');
      }
      if (result.response) {
        const status = result.response.status;
        state.pushToast(
          result.response.error ? 'error' : status >= 400 ? 'warning' : 'success',
          result.response.error
            ? `Request failed: ${result.response.error.message}`
            : `${draft.method} → ${status} in ${formatDuration(result.response.responseTime)}`,
        );
      }
      if (result.variableIssues && result.variableIssues.length > 0) {
        state.pushToast('warning', `${result.variableIssues.length} unresolved variable(s) in request.`);
      }
      state.historyTotal += 1;
      state.emit('history');
    } catch (error) {
      setResponse(null);
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      state.runState = { running: false };
      this.setRunning(false);
      this.renderResponse();
    }
  }

  private async cancel(): Promise<void> {
    try {
      await RequestService.cancel();
      state.pushToast('info', 'Request cancelled.');
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async authorize(): Promise<void> {
    const draft = ensureDraft();
    try {
      const result = await bridgeAuthorize(draft.id, draft.authentication);
      if (result.auth) {
        updateDraft((current) => {
          current.authentication = result.auth!;
        });
        await RequestService.saveDraft(ensureDraft());
        this.renderBuilder();
      }
      state.pushToast(result.authorized ? 'success' : 'error', result.authorized ? 'OAuth2 token acquired.' : 'Authorization failed.');
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async clearOAuthTokens(): Promise<void> {
    const draft = ensureDraft();
    if (draft.authentication.type !== 'oauth2') return;
    try {
      const result = await bridgeClearOAuthTokens(draft.id, draft.authentication);
      updateDraft((current) => {
        current.authentication = result.auth;
      });
      await RequestService.saveDraft(ensureDraft());
      this.renderBuilder();
      state.pushToast('success', 'OAuth2 tokens cleared.');
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private setRunning(running: boolean): void {
    this.sendButton.style.display = running ? 'none' : '';
    this.cancelButton.style.display = running ? '' : 'none';
    this.sendButton.disabled = running;
  }

  // --- response ---------------------------------------------------------

  private renderResponse(): void {
    if (!this.responseRoot) return;
    clear(this.responseRoot);
    const response = state.response;
    const running = state.runState.running;

    const header = h('div', { className: 'gc-response-header' });
    if (running) {
      header.append(
        spinner(),
        h('span', { className: 'gc-muted', text: state.runState.phase ?? 'Sending request…' }),
      );
    } else if (!response) {
      header.append(
        h('span', { className: 'gc-muted gc-small', text: 'Response will appear here' }),
      );
    } else {
      header.append(
        statusBadge(response.status, !!response.error),
        h('div', { className: 'gc-response-meta' },
          h('span', null, 'Time ', h('strong', { text: formatDuration(response.responseTime) })),
          h('span', null, 'Size ', h('strong', { text: formatSize(response.responseSize) })),
          response.contentType
            ? h('span', null, 'Type ', h('strong', { text: response.contentType }))
            : h('span'),
        ),
        h('span', { className: 'gc-spacer' }),
        response.error
          ? h('span', { className: 'gc-chip error', text: response.error.code })
          : h('span', { className: `gc-chip ${response.status < 400 ? 'success' : 'error'}`,
              text: `${response.status} ${response.statusText ?? ''}`.trim() }),
      );
    }
    this.responseRoot.appendChild(header);

    if (running && !response) {
      this.responseRoot.appendChild(
        h('div', { className: 'gc-response-body' }, skeletonBlock()),
      );
      return;
    }

    if (!response) {
      this.responseRoot.appendChild(
        h('div', { className: 'gc-response-body' },
          emptyState('send', 'Nothing sent yet', 'Build a request above and press Send (or Ctrl+Enter).')),
      );
      return;
    }

    if (response.error && !response.body) {
      this.responseRoot.appendChild(
        h('div', { className: 'gc-response-body' },
          h('div', { className: 'gc-response-error' },
            h('h4', { text: response.error.message }),
            h('div', { className: 'code', text: response.error.code }))),
      );
      return;
    }

    this.responseTabs = new Tabs({
      tabs: [
        { id: 'pretty', label: 'Pretty' },
        { id: 'raw', label: 'Raw' },
        { id: 'preview', label: 'Preview' },
        { id: 'headers', label: 'Headers', count: Object.keys(response.headers ?? {}).length },
        { id: 'tests', label: 'Tests', ...(state.testRun ? { count: state.testRun.summary.total } : {}) },
      ],
      active: this.activeResponseTab,
      onChange: (id) => {
        this.activeResponseTab = id as ResponseTab;
        this.renderResponse();
      },
      className: 'gc-response-tabs',
    });
    this.responseRoot.appendChild(this.responseTabs.element());

    const body = h('div', { className: 'gc-response-body' });
    body.appendChild(this.renderResponsePane(response));
    this.responseRoot.appendChild(body);

    if (state.lastWarnings.length > 0) {
      this.responseRoot.appendChild(
        h('div', { className: 'gc-editor-status' },
          h('span', { className: 'invalid', text: `⚠ ${state.lastWarnings[0]}` })),
      );
    }
  }

  private renderResponsePane(response: HttpResponseModel): HTMLElement {
    switch (this.activeResponseTab) {
      case 'pretty':
      case 'raw':
      case 'preview': {
        const viewer = new JsonViewer({
          text: response.body ?? '',
          mode: this.activeResponseTab === 'pretty' ? 'pretty' : this.activeResponseTab === 'raw' ? 'raw' : 'preview',
          emptyLabel: response.bodyKind === 'binary' ? 'Binary response — not displayed.' : 'Empty response body.',
        });
        return viewer.element();
      }
      case 'headers': {
        const entries = Object.entries(response.headers ?? {});
        if (entries.length === 0) {
          return emptyState('table', 'No headers', 'The response contained no headers.');
        }
        const list = h('div', { className: 'gc-headers-list' });
        for (const [name, value] of entries) {
          list.appendChild(
            h('div', { className: 'gc-header-row' },
              h('span', { className: 'name', text: name }),
              h('span', { className: 'value', text: value })),
          );
        }
        return list;
      }
      case 'tests': {
        if (!state.testRun) {
          return emptyState(
            'flask',
            'No tests run',
            'Attach assertions to this request on the Tests page, then send it again.',
            button('Open Tests', { variant: 'primary', onClick: () => navigate('tests') }),
          );
        }
        return renderTestRun(state.testRun);
      }
    }
  }
}

// --- helpers -------------------------------------------------------------

function collectRows(editor: KeyValueEditor): KeyValueRow[] {
  return editor.getRows().map((row) => ({ ...row }));
}

function bodyLabel(type: string): string {
  switch (type) {
    case 'none': return 'None';
    case 'json': return 'JSON';
    case 'text': return 'Raw text';
    case 'xml': return 'XML';
    case 'formUrlEncoded': return 'Form (urlencoded)';
    case 'multipart': return 'Form (multipart)';
    default: return type;
  }
}

function defaultAuthFor(type: AuthConfig['type']): AuthConfig {
  switch (type) {
    case 'bearer':
      return { type: 'bearer', token: '' };
    case 'basic':
      return { type: 'basic', username: '', password: '' };
    case 'apiKey':
      return { type: 'apiKey', key: '', value: '', placement: 'header' };
    case 'oauth2':
      return {
        type: 'oauth2',
        grant: 'clientCredentials',
        tokenUrl: '',
        clientId: '',
        clientSecret: '',
        scope: '',
      };
    default:
      return { type: 'none' };
  }
}

function createFreshRequest(): HttpRequestModel {
  const now = new Date().toISOString();
  return {
    id: newRequestId(),
    name: 'New Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: { type: 'none' },
    authentication: { type: 'none' },
    timeout: 30000,
    settings: { followRedirects: true },
    createdAt: now,
    updatedAt: now,
  };
}

function skeletonBlock(): HTMLElement {
  const wrap = h('div', { className: 'gc-response-skeleton' });
  for (let i = 0; i < 6; i += 1) {
    wrap.appendChild(h('div', { className: 'gc-skeleton-line', style: { width: `${85 - i * 8}%` } }));
  }
  return wrap;
}

function renderTestRun(run: TestRunResult): HTMLElement {
  const wrap = h('div', { className: 'gc-test-results' });
  wrap.appendChild(
    h('div', { className: 'gc-row', style: { marginBottom: '4px' } },
      h('span', { className: `gc-chip ${run.summary.failed > 0 ? 'error' : 'success'}`,
        text: `${run.summary.passed}/${run.summary.total} passed` }),
      h('span', { className: 'gc-muted gc-small', text: `completed in ${run.responseTime} ms` })),
  );
  for (const test of run.results) {
    const result = h('div', { className: `gc-test-result ${test.status}` });
    const assertions = h('div', { className: 'gc-assertions' });
    for (const assertion of test.assertions) {
      assertions.appendChild(
        h('div', { className: `gc-assertion ${assertion.status}` },
          icon(assertion.status === 'passed' ? 'check' : assertion.status === 'failed' ? 'x' : 'warn'),
          h('span', { className: 'desc', text: assertion.description }),
          assertion.message ? h('span', { className: 'detail', text: assertion.message }) : h('span')),
      );
    }
    for (const extraction of test.extractions) {
      assertions.appendChild(
        h('div', { className: `gc-assertion ${extraction.status}` },
          icon(extraction.status === 'passed' ? 'check' : 'x'),
          h('span', { className: 'desc', text: `extract ${extraction.name}` }),
          h('span', { className: 'detail', text: extraction.value ?? extraction.message ?? '' })),
      );
    }
    result.append(
      h('div', { className: 'gc-test-result-head' },
        icon(test.status === 'passed' ? 'check' : test.status === 'failed' ? 'x' : 'warn'),
        h('span', { text: test.name })),
      assertions,
    );
    wrap.appendChild(result);
  }
  return wrap;
}

// Bridge helpers kept local to keep this module's import graph flat.
async function bridgeAuthorize(
  requestId: string,
  auth: AuthConfig,
): Promise<{ authorized: boolean; auth?: AuthConfig }> {
  return bridge.request('auth.oauth2Authorize', { requestId, auth }, 120000);
}

async function bridgeClearOAuthTokens(
  requestId: string,
  auth: OAuth2Auth,
): Promise<{ cleared: boolean; auth: OAuth2Auth }> {
  return bridge.request('auth.oauth2Clear', { requestId, auth }, 10000);
}

async function EnvironmentServiceSetActive(environmentId: string): Promise<void> {
  try {
    await EnvironmentService.setActive(environmentId);
  } catch (error) {
    state.pushToast('error', error instanceof Error ? error.message : String(error));
  }
}

export const requestPage = new RequestPage();
export { renderTestRun };
export type { TestRunResult };
