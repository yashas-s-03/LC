
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const value = {
        user,
        session,
        loading,
        signInWithGithub: async () => {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'github',
                options: {
                    redirectTo: window.location.origin,
                }
            });
            if (error) throw error;
        },
        signOut: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        },
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div style={{
                    height: '100vh',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    <span style={{ fontSize: '3rem', animation: 'bounce 1s infinite' }}>🧠</span>
                    <h2>Loading...</h2>
                </div>
            ) : children}
        </AuthContext.Provider>
    );
};
