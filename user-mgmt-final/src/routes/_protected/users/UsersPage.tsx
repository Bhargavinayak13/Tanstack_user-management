
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch, Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { appStore } from "@/store/appStore";
import { DataTable } from "@/components/DataTable";
import { useMemo, useState, useEffect } from "react";

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  username: string;
  age: number;
  image: string;
  company: { name: string };
}

interface SearchParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

const col = createColumnHelper<User>();

function getHeaders(): HeadersInit {
  const token = appStore.state.token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ✅ Debounce hook — waits 400ms after user stops typing
function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function UsersPage() {
  const navigate = useNavigate({ from: "/app/users" });
  const search = useSearch({ from: "/app/users" }) as SearchParams;
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const searchQuery = search.search || "";
  const currentPage = search.page || 1;
  const pageSize = search.pageSize || 10;
  const skip = (currentPage - 1) * pageSize;

  // ✅ Debounced search — API only fires 400ms after user stops typing
  const debouncedSearch = useDebounce(searchQuery, 400);

  // ✅ Unique localStorage key per page + pageSize + search combo
  const STORAGE_KEY = `users_${currentPage}_${pageSize}_${debouncedSearch}`;

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["users", { page: currentPage, pageSize, search: debouncedSearch }],

    queryFn: async () => {
      const url = debouncedSearch.trim()
        ? `https://dummyjson.com/users/search?q=${encodeURIComponent(debouncedSearch)}&limit=${pageSize}&skip=${skip}`
        : `https://dummyjson.com/users?limit=${pageSize}&skip=${skip}`;

      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to fetch users");
      const result = await res.json();

      // ✅ Save to localStorage after every successful fetch
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        data: result,
        savedAt: Date.now(),
      }));

      return result as { users: User[]; total: number };
    },

    // ✅ Load from localStorage instantly on first render
    initialData: () => {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (!cached) return undefined;
        const { data, savedAt } = JSON.parse(cached);
        // ✅ Discard cache older than 5 minutes
        if (Date.now() - savedAt > 1000 * 60 * 5) {
          localStorage.removeItem(STORAGE_KEY);
          return undefined;
        }
        return data;
      } catch {
        return undefined;
      }
    },
    initialDataUpdatedAt: () => {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (!cached) return undefined;
        const { savedAt } = JSON.parse(cached);
        return savedAt;
      } catch {
        return undefined;
      }
    },

    placeholderData: (prev) => prev,
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`https://dummyjson.com/users/${id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      Object.keys(localStorage)
        .filter((key) => key.startsWith("users_"))
        .forEach((key) => localStorage.removeItem(key));
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeleteId(null);
    },
  });

  const handleSearchChange = (value: string) => {
    navigate({
      search: { search: value || undefined, page: 1, pageSize },
    });
  };

  const handlePageChange = (page: number) => {
    navigate({
      search: { search: searchQuery || undefined, page, pageSize },
    });
  };

  const handlePageSizeChange = (newSize: number) => {
    navigate({
      search: { search: searchQuery || undefined, page: 1, pageSize: newSize },
    });
  };

  const columns = useMemo(
    () => [
      col.display({
        id: "avatar",
        header: "",
        cell: ({ row }) => (
          <img
            src={row.original.image}
            alt={row.original.firstName}
            style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      }),
      col.accessor("firstName", {
        header: "First Name",
        cell: (info) => <strong>{info.getValue()}</strong>,
      }),
      col.accessor("lastName", { header: "Last Name" }),
      col.accessor("email", { header: "Email" }),
      col.accessor("phone", { header: "Phone" }),
      col.accessor("username", { header: "Username" }),
      col.accessor("age", { header: "Age" }),
      col.accessor((row) => row.company?.name, { id: "company", header: "Company" }),
      col.display({
        id: "actions",
        header: "Actions",
        enableHiding: false,
        cell: ({ row }) => (
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              className="btn btn-ghost"
              style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
              onClick={() =>
                navigate({
                  to: "/app/users/$id/edit",
                  params: { id: String(row.original.id) },
                })
              }
            >
              ✏️ Edit
            </button>
            <button
              className="btn btn-danger"
              style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
              onClick={() => setDeleteId(row.original.id)}
            >
              🗑️ Delete
            </button>
          </div>
        ),
      }),
    ],
    [navigate]
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Users</h1>
        <Link to="/app/users/new">
          <button className="btn btn-primary">+ New User</button>
        </Link>
      </div>

      {/* SEARCH BAR */}
      <div className="card" style={{ marginBottom: "1.25rem", padding: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{ flex: 1 }}
          />
          {searchQuery && (
            <button className="btn btn-ghost" onClick={() => handleSearchChange("")}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            Loading users…
          </div>
        ) : isError ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--danger)" }}>
            Failed to load users. Check your connection.
          </div>
        ) : (
          <>
            {isFetching && !isLoading && (
              <div style={{ padding: "0.4rem 1rem", fontSize: "0.8rem", color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}>
                Refreshing…
              </div>
            )}

            <DataTable data={users} columns={columns} />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "1rem",
                borderTop: "1px solid var(--border-color)",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Page {currentPage} of {totalPages} — {total} total users
              </span>

              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  style={{
                    padding: "0.4rem 0.6rem",
                    fontSize: "0.875rem",
                    borderRadius: "4px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    className="btn btn-ghost"
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                    style={{ padding: "0.3rem 0.8rem", fontSize: "0.875rem" }}
                  >
                    ← Prev
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => handlePageChange(currentPage + 1)}
                    style={{ padding: "0.3rem 0.8rem", fontSize: "0.875rem" }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* DELETE MODAL */}
      {deleteId && (
        <div
          style={{ position: "fixed", inset: 0, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={() => setDeleteId(null)}
        >
          <div className="card" style={{ maxWidth: "360px", width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: "0.75rem", fontSize: "1.1rem" }}>Delete User?</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
              This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteId)}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}