import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import DeviceStatus from './DeviceStatus';
import { apiFetch } from '../api';

// Brand suggestions per category
const brandsByCategory = {
  Ski: ['Atomic', 'Blizzard', 'Dynastar', 'Elan', 'Fischer', 'Head', 'K2', 'Nordica', 'Rossignol', 'Salomon', 'Völkl'],
  Snowboard: ['Burton', 'Capita', 'GNU', 'Jones', 'K2', 'Lib Tech', 'Nitro', 'Ride', 'Rome', 'Salomon'],
  Skischuhe: ['Atomic', 'Dalbello', 'Fischer', 'Head', 'Lange', 'Nordica', 'Rossignol', 'Salomon', 'Scarpa', 'Tecnica'],
  Snowboardboots: ['Burton', 'DC', 'Deeluxe', 'K2', 'Nitro', 'Ride', 'Salomon', 'ThirtyTwo', 'Vans'],
  Skibindung: ['Atomic', 'Fischer', 'Head', 'Look', 'Marker', 'Salomon', 'Tyrolia'],
  Snowboardbindung: ['Burton', 'Flow', 'K2', 'Nitro', 'Ride', 'Rome', 'Salomon', 'Union'],
  Skistoecke: ['Atomic', 'Black Diamond', 'Gipron', 'Komperdell', 'Leki', 'Rossignol', 'Salomon', 'Scott'],
  Helm: ['Alpina', 'Atomic', 'Giro', 'Head', 'Oakley', 'POC', 'Salomon', 'Smith', 'Sweet Protection', 'Uvex'],
  Skibrille: ['Alpina', 'Anon', 'Atomic', 'Dragon', 'Giro', 'Oakley', 'POC', 'Salomon', 'Smith', 'Uvex'],
  Bekleidung: ["Arc'teryx", 'Bogner', 'Columbia', 'Descente', 'Helly Hansen', 'Jack Wolfskin', 'Kjus', 'Mammut', 'Ortovox', 'Patagonia', 'Peak Performance', 'Schöffel', 'Spyder', 'The North Face'],
  Zubehoer: ['Dakine', 'Deuter', 'Leki', 'Ortovox', 'Pieps', 'Swix'],
  Sonstiges: []
};

function ItemForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const queryParams = new URLSearchParams(location.search);
  const sellerIdFromUrl = queryParams.get('seller');
  const isNewSeller = queryParams.get('new') === 'true';

  const [formData, setFormData] = useState({
    category: '',
    brand: '',
    color: '',
    size: '',
    price: '',
    seller: sellerIdFromUrl || '',
    barcode: ''
  });
  const [sellers, setSellers] = useState([]);
  const [currentSeller, setCurrentSeller] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddAnother, setShowAddAnother] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [showFeePopup, setShowFeePopup] = useState(false);
  const [acceptanceFee, setAcceptanceFee] = useState(0);
  const [printStatus, setPrintStatus] = useState(null);
  const [sellerItems, setSellerItems] = useState([]);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [filteredBrands, setFilteredBrands] = useState([]);
  const brandInputRef = useRef(null);

  useEffect(() => {
    fetchSellers();
    if (isEditMode) {
      fetchItem();
    } else {
      // Reset form when in create mode (either initial load or returning from edit)
      setFormData({
        category: '',
        brand: '',
        color: '',
        size: '',
        price: '',
        seller: sellerIdFromUrl || '',
        barcode: ''
      });
      // Show "add another" UI if we have a seller from URL (returning from edit mode)
      if (sellerIdFromUrl) {
        setShowAddAnother(true);
      }
    }
  }, [id]);

  useEffect(() => {
    if (currentSeller) {
      fetchSellerItems();
    }
  }, [currentSeller]);

  // Set current seller after sellers are loaded in edit mode
  useEffect(() => {
    if (isEditMode && formData.seller && sellers.length > 0 && !currentSeller) {
      const seller = sellers.find(s => s.id === parseInt(formData.seller));
      if (seller) {
        setCurrentSeller(seller);
      }
    }
  }, [sellers, formData.seller, isEditMode]);

  const fetchSellerItems = async () => {
    if (!currentSeller) return;
    try {
      const response = await apiFetch(`/api/items/?seller=${currentSeller.id}`);
      if (response.ok) {
        const items = await response.json();
        // Sort by item number (ascending) - extract number after dash in barcode (e.g., S001-003 -> 3)
        items.sort((a, b) => {
          const aNum = parseInt(a.barcode.split('-')[1]) || 0;
          const bNum = parseInt(b.barcode.split('-')[1]) || 0;
          return aNum - bNum;
        });
        setSellerItems(items);
      }
    } catch (err) {
      console.error('Error fetching seller items:', err);
    }
  };

  const fetchSellers = async () => {
    try {
      const response = await apiFetch('/api/sellers/');
      if (!response.ok) throw new Error('Failed to fetch sellers');
      const data = await response.json();
      setSellers(data);

      if (sellerIdFromUrl) {
        const seller = data.find(s => s.id === parseInt(sellerIdFromUrl));
        if (seller) {
          setCurrentSeller(seller);
        }
      }
    } catch (err) {
      console.error('Error fetching sellers:', err);
    }
  };

  const refreshSellerData = async () => {
    if (!currentSeller) return;
    try {
      const response = await apiFetch(`/api/sellers/${currentSeller.id}/`);
      if (response.ok) {
        const data = await response.json();
        setCurrentSeller(data);
        return data;
      }
    } catch (err) {
      console.error('Error refreshing seller:', err);
    }
    return currentSeller;
  };

  const fetchItem = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/items/${id}/`);
      if (!response.ok) throw new Error('Failed to fetch item');
      const data = await response.json();
      setFormData({
        category: data.category || '',
        brand: data.brand || '',
        color: data.color || '',
        size: data.size || '',
        price: data.price || '',
        seller: data.seller || '',
        barcode: data.barcode || ''
      });
      // Set current seller for edit mode to show items list
      if (data.seller && sellers.length > 0) {
        const seller = sellers.find(s => s.id === data.seller);
        if (seller) {
          setCurrentSeller(seller);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'price') {
      // Allow digits, one dot or comma as decimal separator
      const filtered = value.replace(',', '.').replace(/[^0-9.]/g, '');
      // Prevent multiple dots
      const parts = filtered.split('.');
      const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : filtered;
      setFormData(prev => ({ ...prev, [name]: sanitized }));
      return;
    }

    if (name === 'brand') {
      // Filter brand suggestions based on input and selected category
      const categoryBrands = brandsByCategory[formData.category] || [];
      const filtered = categoryBrands.filter(brand =>
        brand.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredBrands(filtered);
      setShowBrandSuggestions(value.length > 0 && filtered.length > 0);
    }

    if (name === 'category') {
      // Reset brand suggestions when category changes
      setShowBrandSuggestions(false);
      setFilteredBrands([]);
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBrandFocus = () => {
    // Show all brands for the category when focusing on empty field
    const categoryBrands = brandsByCategory[formData.category] || [];
    if (categoryBrands.length > 0) {
      if (formData.brand) {
        const filtered = categoryBrands.filter(brand =>
          brand.toLowerCase().includes(formData.brand.toLowerCase())
        );
        setFilteredBrands(filtered.length > 0 ? filtered : categoryBrands);
      } else {
        setFilteredBrands(categoryBrands);
      }
      setShowBrandSuggestions(true);
    }
  };

  const handleBrandBlur = () => {
    // Delay hiding to allow click on suggestion
    setTimeout(() => setShowBrandSuggestions(false), 200);
  };

  const selectBrand = (brand) => {
    setFormData(prev => ({ ...prev, brand }));
    setShowBrandSuggestions(false);
  };

  const isFormEmpty = () => {
    return !formData.category && !formData.brand && !formData.color && !formData.size && !formData.price;
  };

  const isFormPartiallyFilled = () => {
    const hasAnyData = formData.category || formData.brand || formData.color || formData.size || formData.price;
    const hasRequiredFields = formData.category && formData.price;
    return hasAnyData && !hasRequiredFields;
  };

  const formatPrice = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? '' : num.toFixed(2);
  };

  const printLabel = async (itemId) => {
    try {
      setPrintStatus('printing');
      const response = await apiFetch(`/api/items/${itemId}/print_label/`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        setPrintStatus('success');
      } else {
        setPrintStatus('error');
        console.error('Print error:', data.error);
      }
    } catch (err) {
      setPrintStatus('error');
      console.error('Print error:', err);
    }
    setTimeout(() => setPrintStatus(null), 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const url = isEditMode
        ? `/api/items/${id}/`
        : '/api/items/';

      const method = isEditMode ? 'PUT' : 'POST';

      const submitData = { ...formData, price: formatPrice(formData.price) };

      const response = await apiFetch(url, {
        method,
        body: JSON.stringify(submitData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(JSON.stringify(errorData));
      }

      const createdItem = await response.json();

      // Print labels for newly created items
      if (!isEditMode && createdItem.id) {
        printLabel(createdItem.id);
      }

      if (!isEditMode && currentSeller) {
        setShowAddAnother(true);
        setAddedCount(prev => prev + 1);
        setFormData({
          category: '',
          brand: '',
          color: '',
          size: '',
          price: '',
          seller: currentSeller.id
        });
        fetchSellerItems();
      } else if (isEditMode && currentSeller) {
        // After editing, navigate back to item entry for the seller
        navigate(`/inventory/items/new?seller=${currentSeller.id}`);
      } else {
        navigate('/inventory/items');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const finishAcceptance = async () => {
    if (!isNewSeller) {
      navigate('/inventory/items');
      return;
    }
    const updatedSeller = await refreshSellerData();
    if (updatedSeller && !updatedSeller.is_member) {
      setAcceptanceFee(updatedSeller.acceptance_fee);
      setShowFeePopup(true);
    } else {
      navigate('/inventory/items');
    }
  };

  const handleDone = async () => {
    setError(null);

    // Case 1: Form is completely empty -> just finish
    if (isFormEmpty()) {
      await finishAcceptance();
      return;
    }

    // Case 2: Form has data but required fields missing -> show error
    if (isFormPartiallyFilled()) {
      setError('Bitte Kategorie und Preis ausfüllen oder alle Felder leeren.');
      return;
    }

    // Case 3: Form is filled with required fields -> save article first, then finish
    setLoading(true);
    try {
      const submitData = { ...formData, price: formatPrice(formData.price) };
      const response = await apiFetch('/api/items/', {
        method: 'POST',
        body: JSON.stringify(submitData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(JSON.stringify(errorData));
      }

      const createdItem = await response.json();
      if (createdItem.id) {
        printLabel(createdItem.id);
      }

      setAddedCount(prev => prev + 1);
      setFormData({
        category: '',
        brand: '',
        color: '',
        size: '',
        price: '',
        seller: currentSeller.id
      });
      fetchSellerItems();

      await finishAcceptance();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFeePaid = async () => {
    // Mark acceptance fee as paid
    try {
      await apiFetch(`/api/sellers/${currentSeller.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ acceptance_fee_paid: true })
      });
    } catch (err) {
      console.error('Error updating fee status:', err);
    }
    setShowFeePopup(false);
    navigate('/inventory/items');
  };

  const handleFeeDeferred = async () => {
    // Fee will be deducted at payout
    try {
      await apiFetch(`/api/sellers/${currentSeller.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ acceptance_fee_paid: false })
      });
    } catch (err) {
      console.error('Error updating fee status:', err);
    }
    setShowFeePopup(false);
    navigate('/inventory/items');
  };

  if (loading && isEditMode) {
    return <div className="loading">Lade Artikeldaten</div>;
  }

  return (
    <div className="form-container">
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">
            {isEditMode ? 'Artikel bearbeiten' : 'Artikel erfassen'}
          </h2>
          <DeviceStatus deviceType="printer" label="Etikettendrucker" />
        </div>
      </div>

      {error && <div className="error">Fehler: {error}</div>}

      {showAddAnother && (
        <div className="success">
          Artikel erfolgreich hinzugefügt! ({addedCount} Artikel für {currentSeller?.full_name})
        </div>
      )}

      {printStatus === 'printing' && (
        <div className="info">Etiketten werden gedruckt...</div>
      )}
      {printStatus === 'success' && (
        <div className="success">2 Etiketten gedruckt</div>
      )}
      {printStatus === 'error' && (
        <div className="error">Etiketten konnten nicht gedruckt werden</div>
      )}

      {currentSeller && (
        <div className="seller-info">
          <p><strong>{isEditMode ? 'Artikel bearbeiten für:' : 'Artikel erfassen für:'}</strong> {currentSeller.full_name}</p>
          <p style={{fontSize: '0.9rem', color: '#666'}}>
            Tel: {currentSeller.mobile_number}
            {currentSeller.is_member && <span className="badge badge-member" style={{marginLeft: '0.5rem'}}>Mitglied</span>}
          </p>
        </div>
      )}

      <div className={currentSeller ? 'item-form-split' : ''}>
        <div className="item-form-left">
          {isEditMode && formData.barcode && (
            <div className="barcode-display-section">
              <div className="form-group">
                <label className="form-label">Barcode</label>
                <div className="barcode-value">
                  <span className="barcode-text">{formData.barcode}</span>
                  <span className="barcode-note">Automatisch generiert</span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="form">
            <div className="form-group">
              <label htmlFor="category" className="form-label">Kategorie</label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="form-select"
                required
              >
                <option value="">Kategorie wählen</option>
                <option value="Ski">Ski</option>
                <option value="Snowboard">Snowboard</option>
                <option value="Skischuhe">Skischuhe</option>
                <option value="Snowboardboots">Snowboardboots</option>
                <option value="Skibindung">Skibindung</option>
                <option value="Snowboardbindung">Snowboardbindung</option>
                <option value="Skistoecke">Skistöcke</option>
                <option value="Helm">Helm</option>
                <option value="Skibrille">Skibrille</option>
                <option value="Bekleidung">Bekleidung</option>
                <option value="Zubehoer">Zubehör</option>
                <option value="Sonstiges">Sonstiges</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group brand-input-wrapper">
                <label htmlFor="brand" className="form-label">Marke</label>
                <input
                  ref={brandInputRef}
                  type="text"
                  id="brand"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  onFocus={handleBrandFocus}
                  onBlur={handleBrandBlur}
                  className="form-input"
                  placeholder={formData.category ? "Marke eingeben..." : "Erst Kategorie wählen"}
                  autoComplete="off"
                />
                {showBrandSuggestions && filteredBrands.length > 0 && (
                  <div className="brand-suggestions">
                    {filteredBrands.map((brand) => (
                      <div
                        key={brand}
                        className="brand-suggestion-item"
                        onClick={() => selectBrand(brand)}
                      >
                        {brand}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="color" className="form-label">Farbe</label>
                <input
                  type="text"
                  id="color"
                  name="color"
                  value={formData.color}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="z.B. Rot, Blau"
                />
              </div>

              <div className="form-group">
                <label htmlFor="size" className="form-label">Größe</label>
                <input
                  type="text"
                  id="size"
                  name="size"
                  value={formData.size}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="z.B. 170cm, M, 42"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="price" className="form-label">Preis (€)</label>
              <input
                type="text"
                inputMode="decimal"
                id="price"
                name="price"
                value={formData.price}
                onChange={handleChange}
                className="form-input"
                required
                placeholder="z.B. 25 oder 24.50"
              />
            </div>

            {!currentSeller && (
              <div className="form-group">
                <label htmlFor="seller" className="form-label">Verkäufer</label>
                <select
                  id="seller"
                  name="seller"
                  value={formData.seller}
                  onChange={handleChange}
                  className="form-select"
                  required
                >
                  <option value="">Verkäufer wählen</option>
                  {sellers.map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {seller.full_name}
                    </option>
                  ))}
                </select>
                {sellers.length === 0 && (
                  <p style={{ marginTop: '8px', color: '#E74C3C', fontSize: '0.9rem' }}>
                    Keine Verkäufer vorhanden. <Link to="/inventory/sellers/new" style={{ color: '#4A90E2' }}>Verkäufer anlegen</Link>
                  </p>
                )}
              </div>
            )}

            <div className="form-actions">
              {isEditMode && currentSeller ? (
                <>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {loading ? 'Speichern...' : 'Änderung übernehmen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/inventory/items/new?seller=${currentSeller.id}`)}
                    className="btn btn-secondary"
                  >
                    Abbrechen
                  </button>
                </>
              ) : showAddAnother ? (
                <>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || sellers.length === 0}
                  >
                    {loading ? 'Speichern...' : 'Weiteren Artikel hinzufügen'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDone}
                    className="btn btn-success"
                  >
                    Fertig - Annahme abschließen
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || sellers.length === 0}
                  >
                    {loading ? 'Speichern...' : (isEditMode ? 'Aktualisieren' : 'Artikel hinzufügen')}
                  </button>
                  <Link to="/inventory/items" className="btn btn-secondary">
                    Abbrechen
                  </Link>
                </>
              )}
            </div>
          </form>
        </div>

        {currentSeller && (
          <div className="item-form-right">
            <h3 className="seller-items-title">
              Artikel von {currentSeller.full_name}
              <span className="seller-items-count">{sellerItems.length}</span>
            </h3>
            {sellerItems.length === 0 ? (
              <p className="seller-items-empty">Noch keine Artikel erfasst.</p>
            ) : (
              <div className="seller-items-list">
                {sellerItems.map((item) => (
                  <div
                    key={item.id}
                    className={`seller-item-card ${isEditMode && item.id === parseInt(id) ? 'seller-item-active' : 'seller-item-clickable'}`}
                    onClick={() => {
                      if (!isEditMode || item.id !== parseInt(id)) {
                        navigate(`/inventory/items/${item.id}/edit`);
                      }
                    }}
                    title={isEditMode && item.id === parseInt(id) ? 'Wird gerade bearbeitet' : 'Klicken zum Bearbeiten'}
                  >
                    <div className="seller-item-top">
                      <span className="seller-item-barcode">{item.barcode}</span>
                      <span className="seller-item-price">{item.price} €</span>
                    </div>
                    <div className="seller-item-details">
                      <span className="seller-item-category">{item.category}</span>
                      {item.brand && <span> · {item.brand}</span>}
                      {item.color && <span> · {item.color}</span>}
                      {item.size && <span> · Gr. {item.size}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Acceptance Fee Popup */}
      {showFeePopup && (
        <div className="popup-overlay">
          <div className="popup-card">
            <div className="popup-header">
              <h3>Annahmegebühr</h3>
            </div>
            <div className="popup-body">
              <p className="popup-seller-name">{currentSeller?.full_name}</p>
              <p className="popup-item-count">{addedCount} Artikel angenommen</p>
              <div className="popup-fee">
                <span className="popup-fee-label">Annahmegebühr:</span>
                <span className="popup-fee-amount">{acceptanceFee.toFixed(2)} €</span>
              </div>
            </div>
            <div className="popup-actions">
              <button
                onClick={handleFeePaid}
                className="btn btn-success btn-full"
              >
                Gebühr bezahlt
              </button>
              <button
                onClick={handleFeeDeferred}
                className="btn btn-secondary btn-full"
              >
                Am Ende verrechnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ItemForm;
