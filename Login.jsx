import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const Login = () => {
    const [formData, setFormData] = useState({
        username: '',
        password: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [user, setUser] = useState(null);

    // Check if user is already logged in on component mount
    useEffect(() => {
        const token = localStorage.getItem('authToken');
        const userData = localStorage.getItem('userData');

        if (token && userData) {
            try {
                const parsedUser = JSON.parse(userData);
                setUser(parsedUser);
                setIsLoggedIn(true);
            } catch (e) {
                // Invalid stored data, clear it
                localStorage.removeItem('authToken');
                localStorage.removeItem('userData');
            }
        }
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        // Clear errors when user starts typing
        if (error) setError('');
        if (success) setSuccess('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const response = await fetch('/api/ess/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Store token and user data
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('userData', JSON.stringify(data.user));

                setUser(data.user);
                setIsLoggedIn(true);
                setSuccess('Login successful!');

                // Redirect to main app after a short delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
            } else {
                setError(data.message || 'Login failed');
            }
        } catch (error) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        setUser(null);
        setIsLoggedIn(false);
        setSuccess('Logged out successfully');
    };

    const handleDemoLogin = () => {
        setFormData({
            username: 'admin',
            password: 'admin123'
        });
    };

    if (isLoggedIn && user) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                fontFamily: '"Geist", sans-serif, Arial, sans-serif'
            }}>
                <div style={{
                    background: '#fff',
                    borderRadius: '16px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                    padding: '2rem',
                    width: '100%',
                    maxWidth: '400px',
                    textAlign: 'center'
                }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                        color: '#fff',
                        fontSize: '2rem'
                    }}>
                        ✓
                    </div>

                    <h2 style={{
                        margin: '0 0 0.5rem 0',
                        color: '#1f2937',
                        fontSize: '1.5rem'
                    }}>
                        Welcome back, {user.username}!
                    </h2>

                    <p style={{
                        color: '#6b7280',
                        margin: '0 0 2rem 0'
                    }}>
                        You are successfully logged in.
                    </p>

                    <div style={{
                        display: 'flex',
                        gap: '1rem',
                        flexDirection: 'column'
                    }}>
                        <button
                            onClick={() => window.location.href = '/'}
                            style={{
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '0.9rem 1.5rem',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'transform 0.2s ease',
                                width: '100%'
                            }}
                            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                        >
                            Go to Dashboard
                        </button>

                        <button
                            onClick={handleLogout}
                            style={{
                                background: '#f3f4f6',
                                color: '#374151',
                                border: '1px solid #d1d5db',
                                borderRadius: '12px',
                                padding: '0.9rem 1.5rem',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'background 0.2s ease',
                                width: '100%'
                            }}
                            onMouseOver={(e) => e.target.style.background = '#e5e7eb'}
                            onMouseOut={(e) => e.target.style.background = '#f3f4f6'}
                        >
                            Logout
                        </button>
                    </div>

                    {success && (
                        <div style={{
                            marginTop: '1rem',
                            padding: '0.75rem',
                            background: '#d1fae5',
                            color: '#065f46',
                            borderRadius: '8px',
                            fontSize: '0.9rem'
                        }}>
                            {success}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            fontFamily: '"Geist", sans-serif, Arial, sans-serif'
        }}>
            <div style={{
                background: '#fff',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                padding: '2rem',
                width: '100%',
                maxWidth: '400px'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1rem',
                        color: '#fff',
                        fontSize: '2rem',
                        fontWeight: 'bold'
                    }}>
                        🔐
                    </div>
                    <h1 style={{
                        margin: '0 0 0.5rem 0',
                        color: '#1f2937',
                        fontSize: '1.75rem'
                    }}>
                        Welcome Back
                    </h1>
                    <p style={{
                        color: '#6b7280',
                        margin: 0
                    }}>
                        Sign in to your account
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label
                            htmlFor="username"
                            style={{
                                display: 'block',
                                marginBottom: '0.5rem',
                                fontWeight: '600',
                                color: '#374151',
                                fontSize: '0.9rem'
                            }}
                        >
                            Username
                        </label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            value={formData.username}
                            onChange={handleInputChange}
                            required
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                fontSize: '1rem',
                                color: '#374151',
                                background: '#fff',
                                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                                boxSizing: 'border-box'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea';
                                e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#d1d5db';
                                e.target.style.boxShadow = 'none';
                            }}
                            placeholder="Enter your username"
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label
                            htmlFor="password"
                            style={{
                                display: 'block',
                                marginBottom: '0.5rem',
                                fontWeight: '600',
                                color: '#374151',
                                fontSize: '0.9rem'
                            }}
                        >
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={formData.password}
                            onChange={handleInputChange}
                            required
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                fontSize: '1rem',
                                color: '#374151',
                                background: '#fff',
                                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                                boxSizing: 'border-box'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea';
                                e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#d1d5db';
                                e.target.style.boxShadow = 'none';
                            }}
                            placeholder="Enter your password"
                        />
                    </div>

                    {error && (
                        <div style={{
                            marginBottom: '1rem',
                            padding: '0.75rem',
                            background: '#fee2e2',
                            color: '#dc2626',
                            borderRadius: '8px',
                            fontSize: '0.9rem'
                        }}>
                            {error}
                        </div>
                    )}

                    {success && (
                        <div style={{
                            marginBottom: '1rem',
                            padding: '0.75rem',
                            background: '#d1fae5',
                            color: '#065f46',
                            borderRadius: '8px',
                            fontSize: '0.9rem'
                        }}>
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            background: loading ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.9rem',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'transform 0.2s ease',
                            marginBottom: '1rem'
                        }}
                        onMouseOver={(e) => {
                            if (!loading) e.target.style.transform = 'translateY(-1px)';
                        }}
                        onMouseOut={(e) => {
                            if (!loading) e.target.style.transform = 'translateY(0)';
                        }}
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>

                    <button
                        type="button"
                        onClick={handleDemoLogin}
                        style={{
                            width: '100%',
                            background: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            fontSize: '0.9rem',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'background 0.2s ease'
                        }}
                        onMouseOver={(e) => e.target.style.background = '#e5e7eb'}
                        onMouseOut={(e) => e.target.style.background = '#f3f4f6'}
                    >
                        Use Demo Account (admin/admin123)
                    </button>
                </form>

                <div style={{
                    marginTop: '2rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #e5e7eb',
                    textAlign: 'center'
                }}>
                    <p style={{
                        color: '#6b7280',
                        fontSize: '0.8rem',
                        margin: 0
                    }}>
                        Session expires after 1 hour for security
                    </p>
                </div>
            </div>
        </div>
    );
};

// Render the component
const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Login />);
}

export default Login;
