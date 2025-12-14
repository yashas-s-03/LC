import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { API_URL } from '../config';

export default function NoteModal({ problem, onClose, onSave }) {
    const [note, setNote] = useState(problem.notes || '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setNote(problem.notes || '');
    }, [problem]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/problems/${problem.id}/notes`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    notes: note,
                    user_id: problem.user_id
                }),
            });

            if (res.ok) {
                toast.success('Note updated!');
                onSave(problem.id, note); // Update local state in parent
                onClose();
            } else {
                throw new Error('Failed to update');
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to save note');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'var(--bg-card)',
                padding: '2rem',
                borderRadius: '12px',
                width: '90%',
                maxWidth: '500px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                border: '1px solid var(--border)'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>📝 Notes: {problem.title}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
                </div>

                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add your notes here..."
                    style={{
                        width: '100%',
                        minHeight: '200px',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        marginBottom: '1rem',
                        resize: 'vertical',
                        fontFamily: 'inherit'
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSave();
                        }
                    }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                    <button
                        onClick={handleSave}
                        className="btn-primary"
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Note'}
                    </button>
                </div>
            </div>
        </div>
    );
}
