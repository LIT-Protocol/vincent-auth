import { useState } from 'react';

interface WebAuthnProps {
  authWithWebAuthn: any;
  setView: React.Dispatch<React.SetStateAction<string>>;
  registerWithWebAuthn?: any;
}

export default function WebAuthn({
  authWithWebAuthn,
  setView,
  registerWithWebAuthn,
}: WebAuthnProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error>();

  async function handleRegister() {
    if (!registerWithWebAuthn) {
      setError(new Error('Registration is not available'));
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      await registerWithWebAuthn();
    } catch (err) {
      console.error(err);
      setError(err as Error);
    }
    setLoading(false);
  }

  async function handleAuthenticate() {
    setError(undefined);
    setLoading(true);
    try {
      await authWithWebAuthn();
    } catch (err) {
      console.error(err);
      setError(err as Error);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <>
        {error && (
          <div className="alert alert--error">
            <p>{error.message}</p>
          </div>
        )}
        <div className="loader-container">
          <div className="loader"></div>
          <p>Follow the prompts to continue...</p>
        </div>
      </>
    );
  }

  return (
    <>
      {error && (
        <div className="alert alert--error">
          <p>{error.message}</p>
        </div>
      )}
      <div className="auth-options">
        {registerWithWebAuthn && (
          <div className="auth-option">
            <h2>Register with a passkey</h2>
            <p>Create a new passkey for passwordless authentication.</p>
            <button
              type="button"
              className={`btn btn--outline ${loading && 'btn--loading'}`}
              onClick={handleRegister}
              disabled={loading}
            >
              Create a credential
            </button>
          </div>
        )}

        <div className="auth-option">
          <h2>Sign in with passkey</h2>
          <p>Use your existing passkey to sign in.</p>
          <button
            type="button"
            className={`btn btn--outline ${loading && 'btn--loading'}`}
            onClick={handleAuthenticate}
            disabled={loading}
          >
            Sign in with passkey
          </button>
        </div>
      </div>
      
      <button
        onClick={() => setView('default')}
        className="btn btn--link"
      >
        Back
      </button>
    </>
  );
}
