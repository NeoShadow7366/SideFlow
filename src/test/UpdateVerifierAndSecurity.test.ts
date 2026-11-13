// @vitest-environment node
import * as crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeSha512Base64,
  isAllowedShellUri,
  isUncPath,
  parseLatestYmlEntry,
  resolveWinSystem32Binary,
  splitCliArgs,
  verifyEd25519Signature,
  verifyReleaseManifest,
} from '../../electron/updateVerifier';

describe('Phase 2 Security & Supply-Chain Update Verification Suite', () => {
  it('generates Ed25519 signatures and verifies authentic vs tampered latest.yml manifests', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();

    const fakeBinary = Buffer.from('SideFlow-NSIS-Installer-Payload-v1.9.1');
    const setupSha512 = computeSha512Base64(fakeBinary);
    const portableSha512 = computeSha512Base64(Buffer.from('Portable-Binary'));

    const latestYml = [
      'version: 1.9.1',
      'files:',
      '  - url: SideFlow 1.9.1.exe',
      `    sha512: ${portableSha512}`,
      '    size: 81234560',
      '  - url: SideFlow-Setup-1.9.1.exe',
      `    sha512: ${setupSha512}`,
      '    size: 84567890',
      'path: SideFlow-Setup-1.9.1.exe',
      `sha512: ${setupSha512}`,
      "releaseDate: '2026-11-13T15:00:00.000Z'",
    ].join('\n');

    const signatureBase64 = crypto
      .sign(null, Buffer.from(latestYml, 'utf-8'), privateKey)
      .toString('base64');

    expect(
      verifyEd25519Signature(latestYml, signatureBase64, publicKeyPem)
    ).toBe(true);

    // 1. Disambiguates Setup .exe from Portable .exe even when Portable appears first in files:
    const parsed = parseLatestYmlEntry(latestYml);
    expect(parsed).toEqual({
      version: '1.9.1',
      fileName: 'SideFlow-Setup-1.9.1.exe',
      sha512Base64: setupSha512,
    });

    // 2. Valid signed manifest passes with signatureVerified: true
    const validRes = verifyReleaseManifest({
      ymlText: latestYml,
      expectedFileName: 'SideFlow-Setup-1.9.1.exe',
      signatureBase64,
      publicKeyPem,
      requireSignature: true,
    });
    expect(validRes.valid).toBe(true);
    expect(validRes.signatureVerified).toBe(true);
    expect(validRes.sha512Base64).toBe(setupSha512);

    // 3. Tampered manifest (attacker swaps sha512) fails closed
    const tamperedYml = latestYml.replace(setupSha512, portableSha512);
    const tamperedRes = verifyReleaseManifest({
      ymlText: tamperedYml,
      signatureBase64,
      publicKeyPem,
      requireSignature: true,
    });
    expect(tamperedRes.valid).toBe(false);
    expect(tamperedRes.signatureVerified).toBe(false);
    expect(tamperedRes.error).toMatch(/signature verification failed/i);

    // 4. Missing signature fails closed whenever publicKeyPem is configured (even with requireSignature: false)
    const missingSigRes = verifyReleaseManifest({
      ymlText: latestYml,
      signatureBase64: '',
      publicKeyPem,
      requireSignature: false,
    });
    expect(missingSigRes.valid).toBe(false);
    expect(missingSigRes.error).toMatch(/Missing Ed25519 manifest signature/i);
  });

  it('blocks SMB/UNC paths and remote file:// hosts to prevent NTLMv2 hash leaks', () => {
    expect(isUncPath('\\\\attacker.example.com\\share\\icon.png')).toBe(true);
    expect(isUncPath('//10.0.0.99/c$/Windows/System32/cmd.exe')).toBe(true);
    expect(isUncPath('file://evil-server/share/payload.exe')).toBe(true);
    expect(isUncPath('"\\\\192.168.1.50\\public\\tool.lnk"')).toBe(true);

    expect(isUncPath('C:\\Program Files\\SideFlow\\SideFlow.exe')).toBe(false);
    expect(isUncPath('file:///C:/Users/Local/Desktop/app.lnk')).toBe(false);
    expect(isUncPath('vscode://file/C:/repo')).toBe(false);
  });

  it('allowlists safe Windows shell: URIs (AppsFolder, RecycleBinFolder, Downloads) and rejects arbitrary CLSIDs', () => {
    expect(isAllowedShellUri('shell:RecycleBinFolder')).toBe(true);
    expect(isAllowedShellUri('shell:Downloads')).toBe(true);
    expect(
      isAllowedShellUri(
        'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
      )
    ).toBe(true);

    expect(
      isAllowedShellUri('shell:::{20D04FE0-3AEA-1069-A2D8-08002B30309D}')
    ).toBe(false);
    expect(isAllowedShellUri('shell:Startup')).toBe(false);
    expect(isAllowedShellUri('shell:AppsFolder\\..\\cmd.exe')).toBe(false);
  });

  it('anchors Windows system binaries to %SystemRoot%\\System32 and tokenizes .lnk CLI arguments safely', () => {
    const mockEnv = { SystemRoot: 'D:\\WinNT' } as unknown as NodeJS.ProcessEnv;
    expect(
      resolveWinSystem32Binary(
        'WindowsPowerShell\\v1.0\\powershell.exe',
        mockEnv
      )
    ).toBe('D:\\WinNT\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(resolveWinSystem32Binary('tasklist.exe', mockEnv)).toBe(
      'D:\\WinNT\\System32\\tasklist.exe'
    );
    expect(resolveWinSystem32Binary('explorer.exe', mockEnv)).toBe(
      'D:\\WinNT\\explorer.exe'
    );

    expect(
      splitCliArgs('--processStart "Discord.exe" --profile="Work Space"')
    ).toEqual(['--processStart', 'Discord.exe', '--profile=Work Space']);
    expect(splitCliArgs('')).toEqual([]);
  });
});
