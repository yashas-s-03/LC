
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function Login() {
    const { signInWithGithub, user } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState(null);

    useEffect(() => {
        if (user) {
            navigate('/');
        }
    }, [user, navigate]);

    const handleLogin = async () => {
        try {
            await signInWithGithub();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="app-container">
            <div className="auth-box">
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🧠</div>
                <h1>Welcome Back</h1>
                <p style={{ color: '#8b949e', marginBottom: '2rem' }}>
                    Sign in to track your LeetCode revision progress.
                </p>

                {error && <div className="error-message">{error}</div>}

                <button onClick={handleLogin} className="btn-primary">
                    Continue with GitHub
                </button>
            </div>
        </div>
    );
}
