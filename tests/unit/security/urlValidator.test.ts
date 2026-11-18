/**
 * Unit tests for URL validation policy — the core of the request safety
 * model (protocol allow-list, private network policy, redirect rules).
 */
import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  validateRedirect,
  isLoopbackHostname,
  isPrivateHostname,
  needsVariableResolution,
  DEFAULT_URL_POLICY,
} from '../../../src/security/UrlValidator';

describe('isLoopbackHostname', () => {
  it('recognizes localhost variants', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('LOCALHOST')).toBe(true);
    expect(isLoopbackHostname('api.localhost')).toBe(false);
  });

  it('recognizes 127.0.0.0/8', () => {
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('127.1.2.3')).toBe(true);
    expect(isLoopbackHostname('128.0.0.1')).toBe(false);
  });

  it('recognizes IPv6 loopback', () => {
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('[::1]')).toBe(true);
    expect(isLoopbackHostname('0:0:0:0:0:0:0:1')).toBe(true);
  });
});

describe('isPrivateHostname', () => {
  it('covers RFC1918 ranges', () => {
    expect(isPrivateHostname('10.0.0.1')).toBe(true);
    expect(isPrivateHostname('172.16.0.1')).toBe(true);
    expect(isPrivateHostname('172.31.255.255')).toBe(true);
    expect(isPrivateHostname('172.32.0.1')).toBe(false);
    expect(isPrivateHostname('192.168.1.1')).toBe(true);
    expect(isPrivateHostname('192.169.1.1')).toBe(false);
  });

  it('covers link-local and special-use ranges', () => {
    expect(isPrivateHostname('169.254.1.1')).toBe(true);
    expect(isPrivateHostname('0.0.0.0')).toBe(true);
  });

  it('covers special host suffixes', () => {
    expect(isPrivateHostname('intranet.local')).toBe(true);
    expect(isPrivateHostname('svc.internal')).toBe(true);
    expect(isPrivateHostname('dev.localhost')).toBe(true);
    expect(isPrivateHostname('example.com')).toBe(false);
  });

  it('covers IPv6 unique-local and link-local', () => {
    expect(isPrivateHostname('fd00::1')).toBe(true);
    expect(isPrivateHostname('fc00::1')).toBe(true);
    expect(isPrivateHostname('fe80::1')).toBe(true);
    expect(isPrivateHostname('2001:db8::1')).toBe(false);
  });

  it('treats loopback as private', () => {
    expect(isPrivateHostname('127.0.0.1')).toBe(true);
  });
});

describe('validateUrl', () => {
  it('accepts http and https URLs', () => {
    const http = validateUrl('http://example.com/api');
    expect(http.ok).toBe(true);
    expect(http.url?.href).toBe('http://example.com/api');

    const https = validateUrl('https://example.com/api');
    expect(https.ok).toBe(true);
  });

  it('rejects empty URLs', () => {
    expect(validateUrl('').reason).toBe('empty');
    expect(validateUrl('   ').reason).toBe('empty');
    expect(validateUrl(null as unknown as string).reason).toBe('empty');
  });

  it('rejects other protocols', () => {
    expect(validateUrl('ftp://example.com').reason).toBe('protocol');
    expect(validateUrl('file:///etc/passwd').reason).toBe('protocol');
    expect(validateUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateUrl('data:text/html,<script>').ok).toBe(false);
  });

  it('rejects credentials embedded in the URL', () => {
    const result = validateUrl('https://user:pass@example.com/');
    expect(result.reason).toBe('credentials-in-url');
    expect(result.ok).toBe(false);
  });

  it('rejects over-long URLs', () => {
    const result = validateUrl(`https://example.com/${'a'.repeat(9000)}`);
    expect(result.reason).toBe('too-long');
  });

  it('rejects malformed URLs', () => {
    expect(validateUrl('http://').reason).toBe('malformed');
    expect(validateUrl('not a url').reason).toBe('malformed');
  });

  it('assumes https for bare hostnames', () => {
    const result = validateUrl('api.example.com/users');
    expect(result.ok).toBe(true);
    expect(result.url?.protocol).toBe('https:');
    expect(result.url?.href).toBe('https://api.example.com/users');
  });

  it('marks loopback and private targets', () => {
    const local = validateUrl('http://127.0.0.1:3000/health');
    expect(local.ok).toBe(true);
    expect(local.isLoopback).toBe(true);
    expect(local.isPrivate).toBe(true);

    const publicUrl = validateUrl('https://api.example.com');
    expect(publicUrl.isPrivate).toBe(false);
    expect(publicUrl.isLoopback).toBe(false);
  });

  it('blocks private networks when policy forbids them', () => {
    const policy = { ...DEFAULT_URL_POLICY, allowPrivateNetwork: false };
    const result = validateUrl('http://127.0.0.1:8080/', policy);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('private-network');
    // Public targets still pass.
    expect(validateUrl('https://example.com', policy).ok).toBe(true);
  });

  it('validates the shape of variable placeholders without resolving them', () => {
    const result = validateUrl('https://{{host}}/api/{{version}}/users');
    expect(result.ok).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const result = validateUrl('  https://example.com  ');
    expect(result.ok).toBe(true);
    expect(result.url?.href).toBe('https://example.com/');
  });
});

describe('validateRedirect', () => {
  const from = new URL('https://api.example.com/start');

  it('allows same-protocol redirects', () => {
    expect(validateRedirect(from, 'https://api.example.com/next').ok).toBe(true);
    expect(validateRedirect(from, 'https://other.example.com/next').ok).toBe(true);
    const httpFrom = new URL('http://api.example.com/start');
    expect(validateRedirect(httpFrom, 'http://other.example.com/next').ok).toBe(true);
  });

  it('treats any HTTPS → HTTP hop as a downgrade', () => {
    expect(validateRedirect(from, 'http://other.example.com/next').ok).toBe(false);
  });

  it('blocks HTTPS → HTTP downgrade by default', () => {
    const result = validateRedirect(from, 'http://api.example.com/next');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('protocol');
    expect(result.message).toMatch(/downgrade/i);
  });

  it('allows the downgrade when policy permits it', () => {
    const policy = { ...DEFAULT_URL_POLICY, allowHttpsToHttpRedirect: true };
    expect(validateRedirect(from, 'http://api.example.com/next', policy).ok).toBe(true);
  });

  it('does not downgrade plain HTTP sources', () => {
    const httpFrom = new URL('http://api.example.com/start');
    expect(validateRedirect(httpFrom, 'http://api.example.com/next').ok).toBe(true);
  });

  it('inherits private-network policy for the target', () => {
    const policy = { ...DEFAULT_URL_POLICY, allowPrivateNetwork: false };
    const result = validateRedirect(from, 'https://127.0.0.1:8080/', policy);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('private-network');
  });
});

describe('needsVariableResolution', () => {
  it('detects {{variable}} references', () => {
    expect(needsVariableResolution('{{token}}')).toBe(true);
    expect(needsVariableResolution('Bearer {{ token }}')).toBe(true);
    expect(needsVariableResolution('plain text')).toBe(false);
    expect(needsVariableResolution('{{unclosed')).toBe(false);
    expect(needsVariableResolution('')).toBe(false);
  });
});
