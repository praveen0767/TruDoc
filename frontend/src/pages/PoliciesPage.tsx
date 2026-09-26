import React, { useEffect, useState } from 'react';
import { getPolicies, updatePolicyStatus } from '../lib/api/policies';
import { PolicyRule } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';

export function PoliciesPage() {
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchPolicies = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPolicies();
      setPolicies(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Policy engine service unavailable.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleToggleStatus = async (policy: PolicyRule) => {
    const nextStatus = policy.status === 'ACTIVE' ? 'AUDIT_MODE' : 'ACTIVE';
    setUpdatingId(policy.id);
    try {
      const updated = await updatePolicyStatus(policy.id, nextStatus);
      setPolicies(policies.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update policy status');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 pb-12 max-w-7xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/20">
        <div>
          <h1 className="text-xl font-bold font-mono text-on-surface">Policy Enforcement Controls</h1>
          <p className="text-xs text-on-surface-variant font-mono mt-0.5">
            Deterministic clearing mandates, automated payment pipeline gates, and fraud tolerances.
          </p>
        </div>
      </div>

      {error && (
        <ErrorMessage
          title="Policy Engine Offline"
          message={error}
          onRetry={fetchPolicies}
        />
      )}

      {loading && !error && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          {policies.map((pol) => {
            const isViolated = pol.code === 'POL-FIN-04';
            return (
              <div
                key={pol.id}
                className={`p-5 rounded border transition-all shadow-xs space-y-4 ${
                  isViolated
                    ? 'bg-surface-container-lowest border-error/40'
                    : 'bg-surface-container-lowest border-outline-variant/20 hover:border-primary/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`material-symbols-outlined text-[20px] ${
                        isViolated ? 'text-error' : 'text-primary'
                      }`}
                    >
                      shield
                    </span>
                    <span className="font-bold text-sm text-on-surface">{pol.code}</span>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      pol.status === 'ACTIVE'
                        ? 'bg-secondary/10 text-secondary border border-secondary/25'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {pol.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-on-surface font-sans mb-1">
                    {pol.name}
                  </h3>
                  <p className="text-xs text-on-surface-variant font-sans leading-relaxed">
                    "{pol.mandate}"
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-outline-variant/15">
                  <div className="p-2 bg-surface-container-low rounded">
                    <span className="text-on-surface-variant block uppercase">Tolerance</span>
                    <span className="text-primary font-bold">{pol.tolerance}</span>
                  </div>
                  <div className="p-2 bg-surface-container-low rounded">
                    <span className="text-on-surface-variant block uppercase">Auto-Action</span>
                    <span className="text-tertiary font-bold">{pol.enforcementAction}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 text-[10px]">
                  <span className="text-on-surface-variant">
                    Violations Logged:{' '}
                    <strong className="text-error">{pol.violationsLoggedCount}</strong>
                  </span>

                  <button
                    onClick={() => handleToggleStatus(pol)}
                    disabled={updatingId === pol.id}
                    className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-[10px] transition-colors cursor-pointer border border-outline-variant/30 disabled:opacity-50"
                  >
                    {updatingId === pol.id
                      ? 'Updating...'
                      : pol.status === 'ACTIVE'
                      ? 'Switch to Audit Mode'
                      : 'Activate Enforcement'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
