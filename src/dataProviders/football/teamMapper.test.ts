import { describe, expect, it } from 'vitest';
import { mapExternalTeamName, getTeamDisplayName, getTeamId } from './teamMapper';

describe('teamMapper', () => {
  describe('mapExternalTeamName', () => {
    it('maps Brazil to correct internal ID and Chinese display name', () => {
      const result = mapExternalTeamName('Brazil');
      expect(result).not.toBeNull();
      expect(result!.teamId).toBe('brazil');
      expect(result!.displayName).toBe('巴西');
      expect(result!.rawName).toBe('Brazil');
    });

    it('maps Argentina', () => {
      const result = mapExternalTeamName('Argentina');
      expect(result).not.toBeNull();
      expect(result!.teamId).toBe('argentina');
      expect(result!.displayName).toBe('阿根廷');
    });

    it('maps Germany', () => {
      expect(mapExternalTeamName('Germany')!.displayName).toBe('德国');
    });

    it('maps France', () => {
      expect(mapExternalTeamName('France')!.displayName).toBe('法国');
    });

    it('maps England', () => {
      expect(mapExternalTeamName('England')!.displayName).toBe('英格兰');
    });

    it('maps Spain', () => {
      expect(mapExternalTeamName('Spain')!.displayName).toBe('西班牙');
    });

    it('maps Japan', () => {
      expect(mapExternalTeamName('Japan')!.displayName).toBe('日本');
    });

    it('maps South Korea', () => {
      expect(mapExternalTeamName('South Korea')!.displayName).toBe('韩国');
    });

    it('is case-insensitive', () => {
      const result = mapExternalTeamName('  bRaZiL  ');
      expect(result).not.toBeNull();
      expect(result!.teamId).toBe('brazil');
    });

    it('handles aliases', () => {
      expect(mapExternalTeamName('USA')!.teamId).toBe('usa');
      expect(mapExternalTeamName('Korea Republic')!.teamId).toBe('south-korea');
      expect(mapExternalTeamName('Holland')!.teamId).toBe('netherlands');
      expect(mapExternalTeamName('Turkey')!.teamId).toBe('turkey');
    });

    it('returns null for unknown team', () => {
      expect(mapExternalTeamName('Mars Colony FC')).toBeNull();
    });
  });

  describe('getTeamDisplayName', () => {
    it('returns Chinese name for known team', () => {
      expect(getTeamDisplayName('brazil')).toBe('巴西');
      expect(getTeamDisplayName('france')).toBe('法国');
    });

    it('returns teamId for unknown id', () => {
      expect(getTeamDisplayName('unknown-team')).toBe('unknown-team');
    });
  });

  describe('getTeamId', () => {
    it('returns team ID for known name', () => {
      expect(getTeamId('Brazil')).toBe('brazil');
    });

    it('returns null for unknown name', () => {
      expect(getTeamId('Unknown FC')).toBeNull();
    });
  });
});
