import React, { useEffect, useMemo, useState } from 'react';
import type { Player } from '@arena/shared';
import { normalizeName } from '@arena/shared';
import {
  createPlayer,
  deletePlayer,
  exportPlayers,
  importPlayers,
  listPlayers,
  updatePlayer
} from '../api';
import Modal from '../components/Modal';
import { parseCsv } from '../utils/csv';
import { readFileAsText } from '../utils/files';
import { scoreByQuery } from '../utils/search';

type PlayerForm = {
  display_name: string;
  age: string;
  ib_grade: string;
  notes: string;
};

const emptyForm: PlayerForm = {
  display_name: '',
  age: '',
  ib_grade: '',
  notes: ''
};

type ImportPreview = {
  display_name: string;
  age?: number | null;
  ib_grade?: string | null;
  notes?: string | null;
  duplicate: boolean;
};

type ImportPayload = Omit<ImportPreview, 'duplicate'>;

export default function Players() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [exportPath, setExportPath] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [form, setForm] = useState<PlayerForm>({ ...emptyForm });
  const [formError, setFormError] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<'csv' | 'json'>('csv');
  const [importPreview, setImportPreview] = useState<ImportPreview[]>([]);
  const [importMode, setImportMode] = useState<'skip' | 'update' | 'import_anyway'>('skip');
  const [importError, setImportError] = useState('');
  const [importStats, setImportStats] = useState<{ duplicates: number; total: number }>({ duplicates: 0, total: 0 });
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number; duplicates: number } | null>(null);

  const loadPlayers = () => {
    listPlayers()
      .then(setPlayers)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    loadPlayers();
  }, []);

  const filteredPlayers = useMemo(() => {
    if (!search.trim()) {
      return players;
    }
    const scored = players
      .map((player) => {
        const score = scoreByQuery(search, player.display_name);
        return score.match ? { player, score } : null;
      })
      .filter((entry): entry is { player: Player; score: { rank: number; index: number } } => Boolean(entry))
      .sort((a, b) => a.score.rank - b.score.rank || a.score.index - b.score.index || a.player.display_name.localeCompare(b.player.display_name));
    return scored.map((entry) => entry.player);
  }, [players, search]);

  const stats = useMemo(() => {
    const total = players.length;
    const withAge = players.filter((player) => player.age !== null).length;
    const withGrade = players.filter((player) => Boolean(player.ib_grade && player.ib_grade.trim())).length;
    const withNotes = players.filter((player) => Boolean(player.notes && player.notes.trim())).length;
    const complete = players.filter((player) => player.age !== null && Boolean(player.ib_grade && player.ib_grade.trim())).length;
    const ageSum = players.reduce((sum, player) => sum + (player.age ?? 0), 0);
    const avgAge = withAge > 0 ? Math.round((ageSum / withAge) * 10) / 10 : null;
    const recent = [...players]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
    return { total, withAge, withGrade, withNotes, complete, avgAge, recent };
  }, [players]);

  const openAddModal = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (player: Player) => {
    setEditing(player);
    setForm({
      display_name: player.display_name,
      age: player.age?.toString() ?? '',
      ib_grade: player.ib_grade ?? '',
      notes: player.notes ?? ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleFormChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    const payload = {
      display_name: form.display_name.trim(),
      age: form.age ? Number(form.age) : null,
      ib_grade: form.ib_grade.trim() || null,
      notes: form.notes.trim() || null
    };
    if (!payload.display_name) {
      setFormError('Name is required.');
      return;
    }
    try {
      if (editing) {
        await updatePlayer(editing.id, payload);
      } else {
        await createPlayer(payload);
      }
      setModalOpen(false);
      loadPlayers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save player');
    }
  };

  const handleDelete = async (playerId: string) => {
    try {
      await deletePlayer(playerId);
      loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete player');
    }
  };

  const handleExport = async () => {
    try {
      const result = await exportPlayers();
      setExportPath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const resetImport = () => {
    setImportPreview([]);
    setImportError('');
    setImportStats({ duplicates: 0, total: 0 });
    setImportResult(null);
  };

  const buildPreview = (incoming: Array<{ display_name: string; age?: number | null; ib_grade?: string | null; notes?: string | null }>) => {
    const existing = new Set(players.map((player) => normalizeName(player.display_name)));
    const preview = incoming.map((player) => ({
      ...player,
      duplicate: existing.has(normalizeName(player.display_name))
    }));
    setImportPreview(preview);
    const duplicates = preview.filter((row) => row.duplicate).length;
    setImportStats({ duplicates, total: preview.length });
  };

  const parseCsvPlayers = (text: string) => {
    const rows = parseCsv(text);
    if (rows.length === 0) {
      setImportError('CSV is empty.');
      return;
    }
    const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/\s+/g, '_'));
    const nameIndex = headers.findIndex((header) => header === 'display_name' || header === 'name');
    if (nameIndex === -1) {
      setImportError('CSV must include a display_name (or name) column.');
      return;
    }
    const ageIndex = headers.findIndex((header) => header === 'age');
    const gradeIndex = headers.findIndex((header) => header === 'ib_grade' || header === 'ibgrade');
    const notesIndex = headers.findIndex((header) => header === 'notes' || header === 'note');

    const incoming = rows.slice(1).map((row) => {
      const display_name = (row[nameIndex] ?? '').trim();
      const ageValue = ageIndex >= 0 ? Number(row[ageIndex]) : NaN;
      return {
        display_name,
        age: Number.isFinite(ageValue) ? ageValue : null,
        ib_grade: gradeIndex >= 0 ? (row[gradeIndex] ?? '').trim() || null : null,
        notes: notesIndex >= 0 ? (row[notesIndex] ?? '').trim() || null : null
      };
    }).filter((row) => row.display_name);

    if (incoming.length === 0) {
      setImportError('No valid rows found in CSV.');
      return;
    }
    buildPreview(incoming);
  };

  const parseJsonPlayers = (text: string) => {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      setImportError('JSON must be an array of player objects.');
      return;
    }
    const incoming = parsed
      .map((entry) => {
        const display_name = String(entry.display_name ?? entry.name ?? '').trim();
        if (!display_name) {
          return null;
        }
        const ageValue = entry.age !== undefined ? Number(entry.age) : NaN;
        return {
          display_name,
          age: Number.isFinite(ageValue) ? ageValue : null,
          ib_grade: entry.ib_grade ? String(entry.ib_grade).trim() : null,
          notes: entry.notes ? String(entry.notes).trim() : null
        };
      })
      .filter((row): row is ImportPayload => Boolean(row));

    if (incoming.length === 0) {
      setImportError('No valid players found in JSON.');
      return;
    }
    buildPreview(incoming);
  };

  const handleImportFile = async (file: File | null) => {
    resetImport();
    if (!file) {
      return;
    }
    try {
      const text = await readFileAsText(file);
      if (importTab === 'csv') {
        parseCsvPlayers(text);
      } else {
        parseJsonPlayers(text);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to read import file.');
    }
  };

  const handleImport = async () => {
    setImportError('');
    if (importPreview.length === 0) {
      setImportError('No players to import.');
      return;
    }
    try {
      const payload = importPreview.map((row) => ({
        display_name: row.display_name,
        age: row.age ?? null,
        ib_grade: row.ib_grade ?? null,
        notes: row.notes ?? null
      }));
      const result = await importPlayers({ players: payload, mode: importMode });
      setImportResult(result);
      loadPlayers();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  const downloadTemplate = () => {
    const csv = 'display_name,age,ib_grade,notes\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '24-arena-player-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
      <div className="players-grid">
        <div className="panel players-main">
          <div className="section-title-row">
            <div>
              <div className="section-title">Players</div>
              <div className="helper">Build the roster, then import or edit as the season grows.</div>
            </div>
            <div className="pill">{stats.total} total</div>
          </div>
          <div className="toolbar players-toolbar">
            <div className="search-wrap">
              <input
                className="search-input"
                placeholder="Search players"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="helper">Showing {filteredPlayers.length} of {players.length}</div>
            </div>
            <div className="toolbar-actions">
              <button className="button secondary" onClick={openAddModal}>
                Add Player
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setImportOpen(true);
                  resetImport();
                }}
              >
                Import
              </button>
              <button className="button" onClick={handleExport}>
                Export
              </button>
            </div>
          </div>
          {players.length > 30 && (
            <div className="banner bad">Warning: More than 30 players may slow live scoring.</div>
          )}
          {exportPath && <div className="banner ok">Saved to: {exportPath}</div>}
          {error && <div className="banner bad">{error}</div>}
          {players.length === 0 ? (
            <p>No players yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="table sticky">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Age</th>
                    <th>IB Grade</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((player) => (
                    <tr key={player.id}>
                      <td>{player.display_name}</td>
                      <td>{player.age ?? '-'}</td>
                      <td>{player.ib_grade ?? '-'}</td>
                      <td>{player.notes ?? '-'}</td>
                      <td className="table-actions">
                        <button className="button secondary" type="button" onClick={() => openEditModal(player)}>
                          Edit
                        </button>
                        <button className="button ghost" type="button" onClick={() => handleDelete(player.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel players-sidebar">
          <div className="section-title">Roster Insights</div>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Complete profiles</div>
              <div className="stat-value">{stats.complete}</div>
              <div className="stat-sub">{stats.total - stats.complete} missing age or grade</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg age</div>
              <div className="stat-value">{stats.avgAge ?? '-'}</div>
              <div className="stat-sub">{stats.withAge} ages recorded</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">IB grades</div>
              <div className="stat-value">{stats.withGrade}</div>
              <div className="stat-sub">{stats.total - stats.withGrade} missing</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Notes added</div>
              <div className="stat-value">{stats.withNotes}</div>
              <div className="stat-sub">{stats.total - stats.withNotes} empty</div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-subtitle">Recently added</div>
            {stats.recent.length === 0 ? (
              <div className="helper">No recent players yet.</div>
            ) : (
              <div className="recent-list">
                {stats.recent.map((player) => (
                  <div key={player.id} className="recent-item">
                    <div>
                      <div className="recent-name">{player.display_name}</div>
                      <div className="recent-meta">
                        {player.ib_grade ?? 'No grade'} - {player.age ?? 'Age ?'}
                      </div>
                    </div>
                    <button className="button ghost small" type="button" onClick={() => openEditModal(player)}>
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-section callout">
            <div className="section-subtitle">Quick tips</div>
            <ul className="tip-list">
              <li>Use consistent names for faster search and cleaner leaderboards.</li>
              <li>Add IB grades to group players by cohort.</li>
              <li>Import CSV/JSON to build large rosters quickly.</li>
            </ul>
            <button className="button ghost small" type="button" onClick={downloadTemplate}>
              Download CSV template
            </button>
          </div>
        </div>
      </div>

      <Modal open={modalOpen} title={editing ? 'Edit Player' : 'Add Player'} onClose={() => setModalOpen(false)}>
        <form className="form" onSubmit={handleSave}>
          <div>
            <label>Name</label>
            <input name="display_name" value={form.display_name} onChange={handleFormChange} required />
          </div>
          <div>
            <label>Age</label>
            <input name="age" type="number" min="0" value={form.age} onChange={handleFormChange} />
          </div>
          <div>
            <label>IB Grade</label>
            <input name="ib_grade" list="ib-grade-options" value={form.ib_grade} onChange={handleFormChange} />
            <datalist id="ib-grade-options">
              <option value="MYP5" />
              <option value="DP1" />
              <option value="DP2" />
              <option value="CP1" />
              <option value="CP2" />
            </datalist>
            <div className="helper">Examples: MYP5, DP1, DP2. Any value is accepted.</div>
          </div>
          <div>
            <label>Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleFormChange} />
          </div>
          {formError && <div className="banner bad">{formError}</div>}
          <div className="modal-actions">
            <button className="button" type="submit">
              {editing ? 'Save Changes' : 'Add Player'}
            </button>
            <button className="button secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={importOpen} title="Import Players" onClose={() => setImportOpen(false)} size="lg">
        <div className="tabs">
          <button
            className={`tab ${importTab === 'csv' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setImportTab('csv');
              resetImport();
            }}
          >
            CSV
          </button>
          <button
            className={`tab ${importTab === 'json' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setImportTab('json');
              resetImport();
            }}
          >
            JSON
          </button>
        </div>

        <div className="form" style={{ marginTop: '16px' }}>
          <div>
            <label>{importTab === 'csv' ? 'CSV File' : 'JSON File'}</label>
            <input
              type="file"
              accept={importTab === 'csv' ? '.csv,text/csv' : 'application/json'}
              onChange={(event) => handleImportFile(event.target.files?.[0] ?? null)}
            />
            {importTab === 'csv' && (
              <button className="button ghost small" type="button" onClick={downloadTemplate}>
                Download template
              </button>
            )}
          </div>

          {importStats.total > 0 && (
            <div className="banner ok">
              Preview loaded: {importStats.total} players, {importStats.duplicates} duplicates detected.
            </div>
          )}
          {importError && <div className="banner bad">{importError}</div>}

          <div>
            <label>Duplicate handling</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  name="importMode"
                  value="skip"
                  checked={importMode === 'skip'}
                  onChange={() => setImportMode('skip')}
                />
                Skip duplicates
              </label>
              <label>
                <input
                  type="radio"
                  name="importMode"
                  value="update"
                  checked={importMode === 'update'}
                  onChange={() => setImportMode('update')}
                />
                Update existing
              </label>
              <label>
                <input
                  type="radio"
                  name="importMode"
                  value="import_anyway"
                  checked={importMode === 'import_anyway'}
                  onChange={() => setImportMode('import_anyway')}
                />
                Import anyway
              </label>
            </div>
          </div>

          {importPreview.length > 0 && (
            <div className="table-scroll" style={{ maxHeight: '240px' }}>
              <table className="table sticky">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Age</th>
                    <th>IB Grade</th>
                    <th>Notes</th>
                    <th>Duplicate</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((row, index) => (
                    <tr key={`${row.display_name}-${index}`} className={row.duplicate ? 'row-duplicate' : ''}>
                      <td>{row.display_name}</td>
                      <td>{row.age ?? '-'}</td>
                      <td>{row.ib_grade ?? '-'}</td>
                      <td>{row.notes ?? '-'}</td>
                      <td>{row.duplicate ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importResult && (
            <div className="banner ok">
              Imported {importResult.inserted} new, updated {importResult.updated}, skipped {importResult.skipped}.
            </div>
          )}

          <div className="modal-actions">
            <button className="button" type="button" onClick={handleImport} disabled={importPreview.length === 0}>
              Import Players
            </button>
            <button className="button secondary" type="button" onClick={() => setImportOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
