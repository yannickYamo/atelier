// atelier/adapters/claude-code/adapter.ts — ADAPTER #1. Everything Claude-specific lives here.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { CarrierDeliveryMatrix } from '../../core/delivery/carrier-delivery.js';
import type { HostAdapter, HostCapabilities, InstallResult, VerificationResult, ProtocolPolicy, GuardResult } from '../host-adapter.js';
import type { PortableSkillPackage } from '../../renderers/agent-skill/render.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

export class ClaudeCodeAdapter implements HostAdapter {
  detect(): HostCapabilities {
    return { hostId: 'claude-code', skills: true, plugins: true, blockingHooks: true, persistentPluginData: true, invocationStyle: '/' };
  }
  private dir(projectDir: string, skillId: string): string { return join(projectDir, '.claude', 'skills', skillId); }

  /**
   * WHAT Claude Code ITSELF DELIVERS, when a user invokes the skill natively instead of through Atelier.
   *
   * PROSE and SELF_CHECK are delivered because they are IN SKILL.md, and loading SKILL.md is what makes
   * something a skill on this host — that is the host's own contract, not an assumption about it.
   *
   * EXAMPLE is REFERENCED_UNVERIFIED. SKILL.md names each example file and the condition it applies
   * under, which is how a host that reads further material finds it. That is a real mechanism and it is
   * still not an observation: nobody has watched this host load one. Calling it DELIVERED would rebuild
   * the dark-carrier bug behind a tidier path.
   *
   * OUTPUT_CONTRACT is UNSUPPORTED, and deliberately NOT degraded to prose. A JSON Schema file sitting
   * in a skill directory is not an API-level output constraint; the host composes its own request and
   * Atelier has no way in. Restating the schema as an instruction would swap a runtime guarantee for a
   * request the model can half-satisfy while everything reports success — which is the weaker version
   * the carrier exists to replace.
   */
  carrierDelivery(): CarrierDeliveryMatrix {
    return {
      PROSE: { state: 'DELIVERED', basis: 'SKILL.md is the skill; this host loads it to invoke at all' },
      SELF_CHECK: { state: 'DELIVERED', basis: 'carried in the same SKILL.md body the host loads to invoke' },
      EXAMPLE: { state: 'REFERENCED_UNVERIFIED', basis: 'named from SKILL.md with its condition, for a host that reads further material when pointed at it' },
      OUTPUT_CONTRACT: { state: 'UNSUPPORTED', basis: 'this host composes its own inference request; Atelier cannot supply the schema' },
      NONE: { state: 'NOT_APPLICABLE', basis: 'the author ratified this as not taste' },
    };
  }

  install(pkg: PortableSkillPackage, projectDir: string): InstallResult {
    try {
      const d = this.dir(projectDir, pkg.skillId);
      mkdirSync(d, { recursive: true });
      // A package is a DIRECTORY TREE now, not one file. examples/ and contracts/ are nested, and a
      // flat write silently loses them — the host would hold a skill missing exactly the components
      // that carry PREFERRED and REQUIRED-STRICT behaviour.
      for (const [rel, content] of Object.entries(pkg.files)) {
        const target = join(d, rel);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
      }
      return { ok: true, installedAt: d };
    } catch (e) { return { ok: false, reason: (e as Error).message }; }
  }
  uninstall(skillId: string, projectDir: string): void { rmSync(this.dir(projectDir, skillId), { recursive: true, force: true }); }

  /** Claude invokes skills with a leading slash. Punctuation only — identity is skillId. */
  invocationHint(skillId: string): string { return `/${skillId} <your task>`; }

  /**
   * Claude Code supports blocking PreToolUse hooks, so a refusal here is genuinely enforced rather
   * than advisory. The POLICY is core's; this only carries the verdict across the host boundary.
   */
  installProtocolGuards(policy: ProtocolPolicy): GuardResult {
    // NOTHING IS INSTALLED HERE, AND THAT IS NOW WHAT IT SAYS.
    //
    // This returned `installed: true, enforcedBy: 'BLOCKING_HOOK'` as a hardcoded literal. No hook was
    // written, no config was touched, and `verifyInstallation` — the one method that reads the disk —
    // never looked for one. The value described a capability the host has, from a method whose name
    // promises an action taken.
    //
    // Nothing but a test called it, so no invariant was actually resting on the lie. That is luck, not
    // a defence: the next caller would have found a method reporting successful enforcement and had no
    // way to discover it was a constant.
    return { installed: false, enforcedBy: 'NOT_INSTALLED', artifact: null,
      detail: `Claude Code can enforce a blocking pre-tool hook; Atelier does not install one yet, so the `
        + `protocol is enforced only where Atelier owns the call. `
        + (policy.reasonIfBlocked ? `Current policy would block: ${policy.reasonIfBlocked}.` : 'No active block.') };
  }

  verifyInstallation(pkg: PortableSkillPackage, projectDir: string): VerificationResult {
    const root = this.dir(projectDir, pkg.skillId);
    const p = join(root, 'SKILL.md');
    if (!existsSync(p)) return { present: false, matchesPackage: false, detail: `not installed at ${p}` };
    // EVERY runtime file, not just SKILL.md. Hashing one file of a multi-file package would pass an
    // installation whose examples or output contract had been edited — and those carry the
    // PREFERRED and REQUIRED-STRICT behaviour, which is exactly what an editor would reach for.
    const onDisk: Record<string, string> = {};
    for (const rel of Object.keys(pkg.files)) {
      const t = join(root, rel);
      if (!existsSync(t)) return { present: true, matchesPackage: false, detail: `MISSING COMPONENT: ${rel} is in the compiled package and not on disk` };
      onDisk[rel] = readFileSync(t, 'utf8');
    }
    const matches = sha(JSON.stringify(onDisk)) === pkg.packageHash;
    return { present: true, matchesPackage: matches, detail: matches ? 'matches the compiled package' : 'INSTALLED FILES EDITED — they no longer match what was compiled from the standard' };
  }
  persistentStateLocation(): string { return process.env.CLAUDE_PLUGIN_DATA ?? join(process.env.HOME ?? '.', '.atelier'); }
}
