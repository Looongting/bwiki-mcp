import { describe, it, expect } from 'vitest';
import { SandboxManager } from '../../src/safety/sandbox.js';

describe('SandboxManager', () => {
  it('应生成沙箱页面路径', () => {
    const manager = new SandboxManager('User:${username}/Sandbox', 'MyBot');
    const result = manager.getSandboxPage('TestPage');
    expect(result).toBe('User:MyBot/Sandbox/TestPage');
  });

  it('应从页面名中去除命名空间前缀', () => {
    const manager = new SandboxManager('User:${username}/Sandbox', 'MyBot');
    const result = manager.getSandboxPage('Template:CityList');
    expect(result).toBe('User:MyBot/Sandbox/CityList');
  });

  it('应处理无命名空间的页面', () => {
    const manager = new SandboxManager('User:${username}/Test', 'BotUser');
    const result = manager.getSandboxPage('SomePage');
    expect(result).toBe('User:BotUser/Test/SomePage');
  });

  it('应检测是否为沙箱页面', () => {
    const manager = new SandboxManager('User:${username}/Sandbox', 'MyBot');
    expect(manager.isSandboxPage('User:MyBot/Sandbox/TestPage')).toBe(true);
    expect(manager.isSandboxPage('MainPage')).toBe(false);
  });

  it('应处理多级命名空间如 "User talk:"', () => {
    const manager = new SandboxManager('User:${username}/Sandbox', 'Bot');
    const result = manager.getSandboxPage('User talk:PageName');
    expect(result).toBe('User:Bot/Sandbox/PageName');
  });
});
