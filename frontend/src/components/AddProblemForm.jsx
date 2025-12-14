import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import toast from 'react-hot-toast';

export default function AddProblemForm({ onProblemAdded }) {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        title: '',
        url: '', // Visual input (can be ID or URL)
        canonicalUrl: '', // Actual URL for submission
        difficulty: 'Easy',
        topics: '',
        notes: ''
    });
    const [loading, setLoading] = useState(false);
    // Removed local error state, using toast for errors now
    const [isFetching, setIsFetching] = useState(false);

    // Debounced Auto-Fetch
    useEffect(() => {
        const timer = setTimeout(async () => {
            let url = formData.url;

            // CLEAR STATE if input is empty
            if (!url.trim()) {
                setFormData(prev => ({
                    ...prev,
                    title: '',
                    difficulty: 'Easy',
                    topics: '',
                    notes: '',
                    canonicalUrl: ''
                }));
                return;
            }

            if (url) {
                // Case 1: Pure number (e.g. "3775")
                if (/^\d+$/.test(url.trim())) {
                    // Pass directly
                }
                // Case 2: "Number. Title" pattern
                else if (!url.includes('http') && !url.includes('.com') && /[0-9]+\./.test(url)) {
                    const cleanTitle = url.replace(/^[\d\s.]*/, '').trim();
                    if (cleanTitle.length > 2) {
                        const slug = cleanTitle.toLowerCase()
                            .replace(/[^\w\s-]/g, '')
                            .replace(/\s+/g, '-');
                        url = `https://leetcode.com/problems/${slug}`;
                        toast("Searching by Title: " + cleanTitle, { icon: '🔍', duration: 1500 });
                    }
                }
            }

            // Allow URL containing '/problems/' OR pure numeric input
            const isUrl = url && url.includes('/problems/');
            const isId = /^\d+$/.test(url.trim());

            // REMOVED `&& !formData.title` to allow re-fetching/correcting
            if (isUrl || isId) {
                setIsFetching(true);
                const toastId = toast.loading("Checking LeetCode...");
                try {
                    const res = await fetch(`${API_URL}/fetch-leetcode`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setFormData(prev => {
                            // If input is purely numeric, KEEP it numeric (don't overwrite with URL)
                            // Otherwise, if it was a partial URL or something, update it to the clean one.
                            const isNumeric = /^\d+$/.test(prev.url.trim());

                            return {
                                ...prev,
                                title: data.title,
                                url: isNumeric ? prev.url : data.url,
                                canonicalUrl: data.url, // Store the real URL for submission
                                difficulty: data.difficulty,
                                topics: data.topics ? data.topics.join(', ') : prev.topics
                            };
                        });
                        toast.success("Found: " + data.title, { id: toastId });
                    } else {
                        // Only error if it was a "complete" attempt (simple typing might trigger 404s momentarily)
                        // But since we debounce, user stopped typing.
                        toast.error("Could not find problem", { id: toastId });
                    }
                } catch (error) {
                    toast.error("Network Error", { id: toastId });
                } finally {
                    setIsFetching(false);
                }
            }
        }, 600);

        return () => clearTimeout(timer);
    }, [formData.url]);

    const handleUrlChange = (e) => {
        // Clear canonicalUrl when user types so we don't submit stale data if they change input manually
        setFormData({ ...formData, url: e.target.value, canonicalUrl: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        console.log("Submitting to:", API_URL); // Debugging

        try {
            const response = await fetch(`${API_URL}/problems`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    // Use canonicalUrl if available (from auto-fetch), otherwise raw input
                    url: formData.canonicalUrl || formData.url,
                    user_id: user.id,
                    topics: formData.topics.split(',').map(t => t.trim()).filter(t => t),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to add problem');
            }

            setFormData({ title: '', url: '', difficulty: 'Easy', topics: '', notes: '' });
            if (onProblemAdded) onProblemAdded();

            // Success handled by parent or here? let's do here for form feedback
            // Parent also does toast, but that's fine.
        } catch (err) {
            console.error("Add Problem Error:", err);
            toast.error(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="card add-form">
            <h3 className="section-title" style={{ marginTop: 0, fontSize: '1.2rem' }}>✨ Add New Problem</h3>

            <div className="form-group">
                <input
                    type="text"
                    className="input-field"
                    placeholder="Paste URL, Problem ID (e.g. 3775), or Title (to autofetch details)⚡"
                    value={formData.url}
                    onChange={handleUrlChange}
                />

                <input
                    type="text"
                    className="input-field"
                    placeholder="Problem Title (e.g. Two Sum)"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    required
                />

                <div className="form-row">
                    <select
                        className="input-field"
                        value={formData.difficulty}
                        onChange={e => setFormData({ ...formData, difficulty: e.target.value })}
                    >
                        <option>Easy</option>
                        <option>Medium</option>
                        <option>Hard</option>
                    </select>

                    <input
                        type="text"
                        className="input-field"
                        placeholder="Topics (e.g. Array, DP)"
                        value={formData.topics}
                        onChange={e => setFormData({ ...formData, topics: e.target.value })}
                    />
                </div>

                <textarea
                    className="input-field textarea-field"
                    placeholder="Notes, approaches, or key learnings..."
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                />

                <button
                    type="submit"
                    disabled={loading || isFetching}
                    className="btn-primary"
                    style={{ width: 'auto', padding: '0.8rem 2rem', opacity: (loading || isFetching) ? 0.7 : 1 }}
                >
                    {isFetching ? 'Fetching...' : loading ? 'Adding...' : 'Add Problem'}
                </button>
            </div>
        </form>
    );
}
