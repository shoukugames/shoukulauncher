#!/usr/bin/env node
'use strict';
// Builds the Windows edition without any self-extracting packer:
//
//   dist/ShoukuLauncher-Setup-<v>.msi      Windows Installer package (per-user, no admin needed)
//   dist/ShoukuLauncher-<v>-win-x64.zip    the same app folder as a plain portable zip
//
// 1. electron-builder lays the app out as a normal folder (dist/win-unpacked) and zips it.
// 2. wixl (from msitools, https://wiki.gnome.org/msitools) turns that folder into an MSI.
//    MSI is the operating system's own installer format: Windows Installer copies the files
//    straight into place, nothing is unpacked to %TEMP% and run from there.
//
// The Windows edition has its own version ("windowsVersion" in package.json).
// wixl must be on PATH (Debian/Ubuntu: sudo apt install wixl), or set WIXL=/path/to/wixl.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const pkg = require(path.join(ROOT, 'package.json'));
const VERSION = pkg.windowsVersion || pkg.version;
const APP_DIR = path.join(DIST, 'win-unpacked');
const MSI = path.join(DIST, `ShoukuLauncher-Setup-${VERSION}.msi`);
// Fixed forever: lets a newer MSI replace an older one.
const UPGRADE_CODE = '6F1C3B52-8E2A-4D7B-9A41-5B0C2E7D9F13';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} exited with ${r.status}`);
  return r;
}

function findTool(name) {
  const env = process.env[name.toUpperCase().replace(/-/g, '_')];
  if (env) return env;
  if (process.env.WIXL) {
    const sibling = path.join(path.dirname(process.env.WIXL), name);
    if (fs.existsSync(sibling)) return sibling;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`"${name}" not found. Install msitools/wixl (Debian/Ubuntu: sudo apt install wixl) or set WIXL=/path/to/wixl.`);
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- 1. App folder + portable zip ----------------------------------------------------------
for (const f of fs.readdirSync(DIST).filter((f) => /^ShoukuLauncher-(Setup-)?[\d.]+.*\.(exe|msi|zip|blockmap)$/.test(f) || f.endsWith('__uninstaller.exe'))) {
  fs.rmSync(path.join(DIST, f));
}
run(process.execPath, [
  path.join(ROOT, 'node_modules', 'electron-builder', 'cli.js'),
  '--win', 'zip', '--x64', '--publish', 'never',
  `-c.extraMetadata.version=${VERSION}`,
  `-c.buildVersion=${VERSION}`,
  ...process.argv.slice(2),
]);
if (!fs.existsSync(path.join(APP_DIR, 'Shouku Launcher.exe'))) throw new Error('dist/win-unpacked/Shouku Launcher.exe is missing');

// ---- 2. MSI ----------------------------------------------------------------------------------
const wixl = findTool('wixl');
const heat = findTool('wixl-heat');
const work = path.join(ROOT, 'build', 'msi');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

// Every file of the app folder, as components under INSTALLDIR.
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(path.relative(ROOT, p).split(path.sep).join('/'));
  }
})(APP_DIR);
const harvest = spawnSync(heat, ['--prefix', 'dist/win-unpacked/', '--directory-ref', 'INSTALLDIR', '--component-group', 'AppFiles', '--var', 'var.SourceDir'], {
  cwd: ROOT,
  input: files.join('\n') + '\n',
  maxBuffer: 64 * 1024 * 1024,
});
if (harvest.status !== 0) throw new Error(`wixl-heat failed: ${harvest.stderr}`);
fs.writeFileSync(path.join(work, 'files.wxs'), harvest.stdout);

const name = pkg.build.productName;
const company = pkg.author.name;
const wxs = `<?xml version="1.0" encoding="utf-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="${xml(name)}" Language="1033" Codepage="1252" Version="${VERSION}"
           Manufacturer="${xml(company)}" UpgradeCode="${UPGRADE_CODE}">
    <Package Id="*" InstallerVersion="500" Compressed="yes" InstallScope="perUser"
             Description="${xml(name)} ${VERSION} installer" Manufacturer="${xml(company)}"
             Comments="Open source (GPL-3.0): ${xml(pkg.repository.url.replace(/\.git$/, '').replace(/^git\+/, ''))}"
             Keywords="Shouku Games, launcher, educational games" />
    <MajorUpgrade DowngradeErrorMessage="A newer version of ${xml(name)} is already installed." />
    <Media Id="1" Cabinet="app.cab" EmbedCab="yes" />

    <Icon Id="ShoukuIcon" SourceFile="resources/icon.ico" />
    <Property Id="ARPPRODUCTICON" Value="ShoukuIcon" />
    <Property Id="ARPHELPLINK" Value="https://shoukugames.org/shouku-launcher/" />
    <Property Id="ARPURLINFOABOUT" Value="https://shoukugames.org/" />
    <Property Id="ARPCONTACT" Value="info@shoukugames.org" />
    <Property Id="ARPNOMODIFY" Value="1" />

    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="LocalAppDataFolder">
        <Directory Id="ProgramsDir" Name="Programs">
          <Directory Id="INSTALLDIR" Name="${xml(name)}" />
        </Directory>
      </Directory>
      <Directory Id="ProgramMenuFolder" />
      <Directory Id="DesktopFolder" />
    </Directory>

    <DirectoryRef Id="INSTALLDIR">
      <Component Id="Shortcuts" Guid="9B4D2A61-3C7E-4F58-8D10-6A2E5C9B7F04">
        <Shortcut Id="StartMenuShortcut" Directory="ProgramMenuFolder" Name="${xml(name)}"
                  Description="Open-source, bilingual, educational games from Tokyo"
                  Target="[INSTALLDIR]Shouku Launcher.exe" WorkingDirectory="INSTALLDIR"
                  Icon="ShoukuIcon" />
        <Shortcut Id="DesktopShortcut" Directory="DesktopFolder" Name="${xml(name)}"
                  Description="Open-source, bilingual, educational games from Tokyo"
                  Target="[INSTALLDIR]Shouku Launcher.exe" WorkingDirectory="INSTALLDIR"
                  Icon="ShoukuIcon" />
        <RemoveFolder Id="RemoveInstallDir" On="uninstall" />
        <RegistryValue Root="HKCU" Key="Software\\Shouku Games\\Shouku Launcher" Name="InstallDir"
                       Type="string" Value="[INSTALLDIR]" KeyPath="yes" />
      </Component>
    </DirectoryRef>

    <Feature Id="Main" Title="${xml(name)}" Level="1">
      <ComponentGroupRef Id="AppFiles" />
      <ComponentRef Id="Shortcuts" />
    </Feature>
  </Product>
</Wix>
`;
fs.writeFileSync(path.join(work, 'product.wxs'), wxs);
run(wixl, ['-v', '--arch', 'x64', '-D', 'SourceDir=dist/win-unpacked', '-o', MSI, path.join(work, 'product.wxs'), path.join(work, 'files.wxs')]);

const size = (f) => `${(fs.statSync(f).size / 1048576).toFixed(0)} MB`;
const zip = fs.readdirSync(DIST).find((f) => f.endsWith('.zip'));
console.log(`\nWindows ${VERSION}:\n  ${path.relative(ROOT, MSI)} (${size(MSI)})\n  dist/${zip} (${size(path.join(DIST, zip))})`);
