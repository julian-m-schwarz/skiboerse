import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiFetch } from '../api';

function SellerForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    mobile_number: '',
    is_member: false,
    acceptance_fee_paid: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    if (isEditMode) {
      fetchSeller();
    }
  }, [id]);

  const fetchSeller = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/sellers/${id}/`);
      if (!response.ok) throw new Error('Failed to fetch seller');
      const data = await response.json();
      setFormData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateName = (value) => {
    // Only letters (including umlauts and accented characters) and spaces
    return /^[a-zA-ZäöüÄÖÜßéèêëàâîïôùûçñ\s-]+$/.test(value);
  };

  const validatePhone = (value) => {
    // Only digits, optional leading +, spaces allowed for formatting
    return /^\+?[\d\s]+$/.test(value);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Live validation and filtering
    if (name === 'first_name' || name === 'last_name') {
      // Allow only letters, spaces, hyphens, umlauts
      const filtered = value.replace(/[^a-zA-ZäöüÄÖÜßéèêëàâîïôùûçñ\s-]/g, '');
      setFormData(prev => ({ ...prev, [name]: filtered }));

      if (filtered && !validateName(filtered)) {
        setValidationErrors(prev => ({ ...prev, [name]: 'Nur Buchstaben erlaubt' }));
      } else {
        setValidationErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
      }
      return;
    }

    if (name === 'mobile_number') {
      // Allow only digits, leading +, spaces
      const filtered = value.replace(/[^\d+\s]/g, '').replace(/(?!^)\+/g, '');
      setFormData(prev => ({ ...prev, [name]: filtered }));

      if (filtered && !validatePhone(filtered)) {
        setValidationErrors(prev => ({ ...prev, [name]: 'Nur Zahlen und + am Anfang erlaubt' }));
      } else {
        setValidationErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
      }
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Final validation
    const errors = {};
    if (!validateName(formData.first_name)) {
      errors.first_name = 'Nur Buchstaben erlaubt';
    }
    if (!validateName(formData.last_name)) {
      errors.last_name = 'Nur Buchstaben erlaubt';
    }
    if (!validatePhone(formData.mobile_number)) {
      errors.mobile_number = 'Nur Zahlen und + am Anfang erlaubt';
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setLoading(true);

    try {
      const url = isEditMode
        ? `/api/sellers/${id}/`
        : '/api/sellers/';

      const method = isEditMode ? 'PUT' : 'POST';

      const response = await apiFetch(url, {
        method,
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(JSON.stringify(errorData));
      }

      const data = await response.json();

      if (!isEditMode) {
        navigate(`/inventory/items/new?seller=${data.id}&new=true`);
      } else {
        navigate('/inventory/sellers');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && isEditMode) {
    return <div className="loading">Loading seller data</div>;
  }

  return (
    <div className="form-container">
      <div className="page-header">
        <h2 className="page-title">
          {isEditMode ? 'Verkäufer bearbeiten' : 'Neuer Verkäufer'}
        </h2>
      </div>

      {error && <div className="error">Fehler: {error}</div>}

      <form onSubmit={handleSubmit} className="form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="first_name" className="form-label">Vorname</label>
            <input
              type="text"
              id="first_name"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              className={`form-input ${validationErrors.first_name ? 'input-error' : ''}`}
              required
              placeholder="Vorname"
            />
            {validationErrors.first_name && (
              <span className="validation-error">{validationErrors.first_name}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="last_name" className="form-label">Nachname</label>
            <input
              type="text"
              id="last_name"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              className={`form-input ${validationErrors.last_name ? 'input-error' : ''}`}
              required
              placeholder="Nachname"
            />
            {validationErrors.last_name && (
              <span className="validation-error">{validationErrors.last_name}</span>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="mobile_number" className="form-label">Telefonnummer</label>
          <input
            type="tel"
            id="mobile_number"
            name="mobile_number"
            value={formData.mobile_number}
            onChange={handleChange}
            className={`form-input ${validationErrors.mobile_number ? 'input-error' : ''}`}
            required
            placeholder="+49 123 456 7890"
          />
          {validationErrors.mobile_number && (
            <span className="validation-error">{validationErrors.mobile_number}</span>
          )}
        </div>

        <div className="form-section">
          <div className="form-checkboxes">
            <div className="form-checkbox-group">
              <input
                type="checkbox"
                id="is_member"
                name="is_member"
                checked={formData.is_member}
                onChange={handleCheckboxChange}
                className="form-checkbox"
              />
              <label htmlFor="is_member" className="form-checkbox-label">
                Ist Mitglied
              </label>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Speichern...' : (isEditMode ? 'Aktualisieren' : 'Verkäufer anlegen')}
          </button>
          <Link to="/inventory/sellers" className="btn btn-secondary">
            Abbrechen
          </Link>
        </div>
      </form>
    </div>
  );
}

export default SellerForm;
