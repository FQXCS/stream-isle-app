/**
 * 地址规范化单测（M1 文档 §6.1 normalizeUrl 行 / §4.4 用例）。
 */
import { normalizeAddress, toHostPort } from '@/util/normalizeUrl';

describe('normalizeAddress（§4.4 五类输入 + 非法输入）', () => {
  it('host:port 补 http 协议', () => {
    expect(normalizeAddress('192.168.1.5:8096')).toBe('http://192.168.1.5:8096');
  });

  it('纯 host 补 http 协议', () => {
    expect(normalizeAddress('192.168.1.5')).toBe('http://192.168.1.5');
  });

  it('反代子路径保留为 baseUrl 前缀（host 小写、路径保留原大小写、去结尾斜杠）', () => {
    expect(normalizeAddress('MyHost.lan/Jellyfin/')).toBe('http://myhost.lan/Jellyfin');
  });

  it('https 完整 URL 去 query/hash', () => {
    expect(normalizeAddress('https://a.b.com/c?q=1')).toBe('https://a.b.com/c');
  });

  it('非法输入返回 null（不抛错）', () => {
    expect(normalizeAddress('ht tp://x')).toBeNull();
    expect(normalizeAddress('')).toBeNull();
    expect(normalizeAddress('   ')).toBeNull();
  });

  it('边界：https 协议保留、去多余结尾斜杠、去 hash', () => {
    expect(normalizeAddress('https://a.b.com')).toBe('https://a.b.com');
    expect(normalizeAddress('http://a.b.com/path#frag')).toBe('http://a.b.com/path');
    expect(normalizeAddress('HTTP://A.B.COM')).toBe('http://a.b.com');
  });
});

describe('toHostPort（04 §4.6：TLS 白名单原生键 baseUrl→host:port）', () => {
  it('显式端口保留', () => {
    expect(toHostPort('https://192.168.1.5:8920')).toBe('192.168.1.5:8920');
    expect(toHostPort('http://myhost.lan:8096/jellyfin')).toBe('myhost.lan:8096');
  });

  it('缺省端口按协议补齐（https→443 / http→80）', () => {
    expect(toHostPort('https://a.b.com')).toBe('a.b.com:443');
    expect(toHostPort('http://a.b.com')).toBe('a.b.com:80');
  });

  it('含子路径的 baseUrl 正确提取 host（路径不参与键）', () => {
    expect(toHostPort('https://x.com/jellyfin')).toBe('x.com:443');
  });

  it('host 小写化、非法输入返回 null', () => {
    expect(toHostPort('https://A.B.COM:8920')).toBe('a.b.com:8920');
    expect(toHostPort('')).toBeNull();
    expect(toHostPort('ht tp://x')).toBeNull();
  });
});
