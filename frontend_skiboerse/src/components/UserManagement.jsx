import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'desk' });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await apiFetch('/api/users/');
      if (!response.ok) throw new Error('Benutzer konnten nicht geladen werden');
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const response = await apiFetch('/api/users/create/', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Benutzer konnte nicht erstellt werden');
      }
      setShowCreateModal(false);
      setFormData({ username: '', password: '', role: 'desk' });
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    try {
      const response = await apiFetch(`/api/users/${selectedUser.id}/`, {
        method: 'PUT',
        body: JSON.stringify({ username: formData.username, role: formData.role }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Benutzer konnte nicht aktualisiert werden');
      }
      setShowEditModal(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      const response = await apiFetch(`/api/users/${selectedUser.id}/change-password/`, {
        method: 'POST',
        body: JSON.stringify({ password: formData.password }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Passwort konnte nicht geändert werden');
      }
      setShowPasswordModal(false);
      setSelectedUser(null);
      setFormData({ ...formData, password: '' });
      alert('Passwort erfolgreich geändert');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Benutzer "${user.username}" wirklich löschen?`)) return;
    try {
      const response = await apiFetch(`/api/users/${user.id}/`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Benutzer konnte nicht gelöscht werden');
      }
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({ username: user.username, role: user.role, password: '' });
    setShowEditModal(true);
  };

  const openPasswordModal = (user) => {
    setSelectedUser(user);
    setFormData({ ...formData, password: '' });
    setShowPasswordModal(true);
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'Admin',
      desk: 'Kasse',
      reporter: 'Rückmelder',
    };
    return labels[role] || role;
  };

  const getRoleBadgeClass = (role) => {
    const classes = {
      admin: 'badge-admin',
      desk: 'badge-desk',
      reporter: 'badge-reporter',
    };
    return classes[role] || '';
  };

  if (loading) {
    return <div className="loading">Lade Benutzer...</div>;
  }

  return (
    <div className="user-management-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Benutzer</h2>
          <Link to="/" className="btn btn-secondary">
            ← Zurück
          </Link>
        </div>
        <button
          onClick={() => {
            setFormData({ username: '', password: '', role: 'desk' });
            setShowCreateModal(true);
          }}
          className="btn btn-primary"
        >
          + Neuer Benutzer
        </button>
      </div>

      {error && <div className="error">Fehler: {error}</div>}

      {users.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <p className="empty-state-text">Keine Benutzer vorhanden.</p>
        </div>
      ) : (
        <div className="user-grid">
          {users.map((user) => (
            <div key={user.id} className="user-card">
              <div className="user-card-header">
                <h3 className="user-name">{user.username}</h3>
                <span className={`badge ${getRoleBadgeClass(user.role)}`}>
                  {getRoleLabel(user.role)}
                </span>
              </div>

              <div className="user-card-actions">
                <button
                  onClick={() => openEditModal(user)}
                  className="btn btn-secondary btn-small"
                >
                  Bearbeiten
                </button>
                <button
                  onClick={() => openPasswordModal(user)}
                  className="btn btn-secondary btn-small"
                >
                  Passwort
                </button>
                <button
                  onClick={() => handleDeleteUser(user)}
                  className="btn btn-danger btn-small"
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Neuer Benutzer</h3>
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label>Benutzername</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Passwort</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Rolle</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="admin">Admin</option>
                  <option value="desk">Kasse</option>
                  <option value="reporter">Rückmelder</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Abbrechen
                </button>
                <button type="submit" className="btn btn-primary">
                  Erstellen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Benutzer bearbeiten</h3>
            <form onSubmit={handleEditUser}>
              <div className="form-group">
                <label>Benutzername</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Rolle</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="admin">Admin</option>
                  <option value="desk">Kasse</option>
                  <option value="reporter">Rückmelder</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  Abbrechen
                </button>
                <button type="submit" className="btn btn-primary">
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Passwort ändern für {selectedUser.username}</h3>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label>Neues Passwort</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>
                  Abbrechen
                </button>
                <button type="submit" className="btn btn-primary">
                  Passwort ändern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
