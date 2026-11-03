/**
 * 服务器地址表单 ⇄ baseUrl 单测：拼装保留子路径、缺省端口、非法输入返回 null；
 * 反向解析回填协议/主机/端口/路径。
 */
import { composeServerUrl, splitServerUrl } from '@/util/serverUrl';

describe('composeServerUrl', () => {
  it('协议 + 主机 + 端口 + 子路径拼成规范 baseUrl', () => {
    expect(
      composeServerUrl({ https: true, host: '192.168.1.5', port: '8920', path: '/emby' })
    ).toBe('https://192.168.1.5:8920/emby');
    expect(
      composeServerUrl({ https: false, host: 'demo.example.com', port: '8096', path: '' })
    ).toBe('http://demo.example.com:8096');
  });

  it('空主机/非法输入返回 null', () => {
    expect(composeServerUrl({ https: false, host: '  ', port: '8096', path: '' })).toBeNull();
    expect(composeServerUrl({ https: false, host: 'a b', port: '8096', path: '' })).toBeNull();
  });

  it('容错：粘贴完整地址到「服务器地址」时按完整地址解析', () => {
    expect(
      composeServerUrl({ https: false, host: 'http://192.168.1.5:8096/emby', port: '8096', path: '' })
    ).toBe('http://192.168.1.5:8096/emby');
    expect(
      composeServerUrl({ https: false, host: '10.0.0.2:8080', port: '8096', path: '' })
    ).toBe('http://10.0.0.2:8080');
  });
});

describe('splitServerUrl', () => {
  it('baseUrl 回填四段', () => {
    expect(splitServerUrl('https://192.168.1.5:8920/emby')).toEqual({
      https: true,
      host: '192.168.1.5',
      port: '8920',
      path: 'emby',
    });
    expect(splitServerUrl('http://demo.example.com:8096')).toEqual({
      https: false,
      host: 'demo.example.com',
      port: '8096',
      path: '',
    });
  });

  it('无法解析时主机为空（表单按空值处理）', () => {
    expect(splitServerUrl('not-a-url')).toEqual({ https: false, host: '', port: '', path: '' });
  });
});
