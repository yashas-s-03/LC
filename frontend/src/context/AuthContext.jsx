import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import LoadingScreen from '../components/LoadingScreen';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let safetyTimer;

        const initializeAuth = async () => {
            try {
                // Set a timeout for initial auth check
                safetyTimer = setTimeout(() => {
                    if (loading) {
                        console.warn("Auth initialization timed out. Supabase might be waking up.");
                        setLoading(false);
                    }
                }, 120000); // Increased timeout to 2 minutes

                // Check active sessions and sets the user
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;

                setSession(session);
                setUser(session?.user ?? null);
            } catch (err) {
                console.error("Auth Initialization Error:", err);
                toast.error("Account connection failed. Try refreshing.");
            } finally {
                setLoading(false);
                if (safetyTimer) {
                    clearTimeout(safetyTimer);
                }
            }
        };

        initializeAuth();

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false); // Ensure loading is false after any auth state change
            if (safetyTimer) {
                clearTimeout(safetyTimer);
            }
        });

        return () => {
            subscription.unsubscribe();
            if (safetyTimer) {
                clearTimeout(safetyTimer);
            }
        };
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
                <LoadingScreen />
            ) : children}
        </AuthContext.Provider>
    );
};
