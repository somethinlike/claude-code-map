import { describe, it, expect, beforeAll } from 'vitest';
import { initParser, parseSource } from '../parser.ts';
import { extractTsRoutes } from './typescript.ts';
import { extractPyRoutes, extractPyModels } from './python.ts';
import { extractGoRoutes } from './go.ts';
import { extractRustRoutes } from './rust.ts';
import { extractJavaRoutes } from './java.ts';
import { extractKotlinRoutes } from './kotlin.ts';
import { extractCsharpRoutes } from './csharp.ts';
import { extractPhpRoutes } from './php.ts';
import { extractRubyRoutes } from './ruby.ts';

beforeAll(async () => {
  await initParser();
});

// --- TypeScript / Express ---

describe('extractTsRoutes — Express', () => {
  it('extracts single-line router calls', async () => {
    const src = `
      const router = Router();
      router.get('/users', handler);
      router.post('/users', handler);
    `;
    const tree = await parseSource(src, 'typescript');
    const routes = await extractTsRoutes(tree, 'typescript', 'src/api.ts');
    expect(routes).toHaveLength(2);
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      'GET /users',
      'POST /users',
    ]);
  });

  it('extracts multi-line router calls (regression for V2.1.0)', async () => {
    const src = `
      router.get(
        '/articles/feed',
        auth.required,
        async (req, res) => { res.json([]); }
      );
    `;
    const tree = await parseSource(src, 'typescript');
    const routes = await extractTsRoutes(tree, 'typescript', 'src/api.ts');
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/articles/feed');
    expect(routes[0].method).toBe('GET');
  });

  it('skips method calls on non-router objects', async () => {
    const src = `
      supabase.get('users');
      db.post(record);
    `;
    const tree = await parseSource(src, 'typescript');
    const routes = await extractTsRoutes(tree, 'typescript', 'src/db.ts');
    expect(routes).toHaveLength(0);
  });
});

// --- Python / Django + Flask ---

describe('extractPyRoutes — Django', () => {
  it('extracts path() and re_path() forms', async () => {
    const src = `
from django.urls import path, re_path
urlpatterns = [
    path('articles/', views.list),
    re_path(r'^articles/(?P<id>\\d+)/$', views.detail),
]
    `;
    const tree = await parseSource(src, 'python');
    const routes = await extractPyRoutes(tree, 'python', 'app/urls.py');
    expect(routes.length).toBeGreaterThanOrEqual(2);
    expect(routes.some((r) => r.path.includes('articles/'))).toBe(true);
  });

  it('extracts older url() form (regression for V2.1.0)', async () => {
    const src = `
from django.conf.urls import url
urlpatterns = [
    url(r'^articles/feed/?$', views.ArticlesFeedAPIView.as_view()),
    url(r'^tags/?$', views.TagListAPIView.as_view()),
]
    `;
    const tree = await parseSource(src, 'python');
    const routes = await extractPyRoutes(tree, 'python', 'app/urls.py');
    expect(routes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('extractPyRoutes — Flask', () => {
  it('extracts decorated route handlers', async () => {
    const src = `
@app.route('/users', methods=['GET', 'POST'])
def users():
    return []

@app.route('/users/<int:id>')
def user(id):
    return {}
    `;
    const tree = await parseSource(src, 'python');
    const routes = await extractPyRoutes(tree, 'python', 'app/views.py');
    expect(routes.length).toBeGreaterThanOrEqual(2);
  });
});

// --- Go / Gin ---

describe('extractGoRoutes — Gin', () => {
  it('extracts uppercase HTTP methods (regression for V2.1.0)', async () => {
    const src = `
package main
func register(router *gin.RouterGroup) {
    router.GET("/users", listUsers)
    router.POST("/users", createUser)
    router.DELETE("/users/:id", deleteUser)
}
    `;
    const tree = await parseSource(src, 'go');
    const routes = await extractGoRoutes(tree, 'go', 'main.go');
    expect(routes.length).toBeGreaterThanOrEqual(3);
    expect(routes.some((r) => r.method === 'GET' && r.path === '/users')).toBe(true);
    expect(routes.some((r) => r.method === 'DELETE')).toBe(true);
  });
});

// --- Rust / Axum + Actix ---

describe('extractRustRoutes — Axum', () => {
  it('extracts simple .route() calls (V2.1.0 new feature)', async () => {
    const src = `
fn router() -> Router {
    Router::new()
        .route("/api/users", post(create_user))
        .route("/api/users/login", post(login_user))
}
    `;
    const tree = await parseSource(src, 'rust');
    const routes = await extractRustRoutes(tree, 'rust', 'src/api.rs');
    expect(routes).toHaveLength(2);
    expect(routes[0].framework).toBe('axum');
  });
});

describe('extractRustRoutes — Actix', () => {
  it('extracts attribute macro routes (V2.1.0 new feature)', async () => {
    const src = `
#[get("/users")]
async fn list_users() {}

#[post("/users")]
async fn create_user() {}
    `;
    const tree = await parseSource(src, 'rust');
    const routes = await extractRustRoutes(tree, 'rust', 'src/api.rs');
    expect(routes.length).toBeGreaterThanOrEqual(2);
    expect(routes.some((r) => r.framework === 'actix' && r.method === 'GET')).toBe(true);
    expect(routes.some((r) => r.framework === 'actix' && r.method === 'POST')).toBe(true);
  });
});

// --- Java / Spring Boot ---

describe('extractJavaRoutes — Spring', () => {
  it('extracts direct-string annotation form', async () => {
    const src = `
@RestController
public class UserController {
    @GetMapping("/users")
    public List get() { return null; }

    @PostMapping("/users")
    public void create() {}
}
    `;
    const tree = await parseSource(src, 'java');
    const routes = await extractJavaRoutes(tree, 'java', 'UserController.java');
    expect(routes).toHaveLength(2);
  });

  it('extracts named-argument annotation form (regression for V2.1.0)', async () => {
    const src = `
@RestController
@RequestMapping(path = "/articles/{slug}")
public class ArticleApi {
    @GetMapping
    public ArticleData get() { return null; }

    @PostMapping(value = "/comments")
    public void create() {}
}
    `;
    const tree = await parseSource(src, 'java');
    const routes = await extractJavaRoutes(tree, 'java', 'ArticleApi.java');
    expect(routes.length).toBeGreaterThanOrEqual(2);
    // Class-level prefix should be applied
    expect(routes.some((r) => r.path.includes('/articles/{slug}'))).toBe(true);
  });

  it('extracts bare marker annotations', async () => {
    const src = `
@RequestMapping(path = "/user")
public class CurrentUserApi {
    @GetMapping
    public User getCurrent() { return null; }
}
    `;
    const tree = await parseSource(src, 'java');
    const routes = await extractJavaRoutes(tree, 'java', 'CurrentUserApi.java');
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('GET');
    expect(routes[0].path).toBe('/user');
  });
});

// --- Kotlin / Spring Boot ---

describe('extractKotlinRoutes — Spring', () => {
  it('extracts annotations through constructor_invocation wrapper (regression for V2.1.0)', async () => {
    const src = `
@RestController
class UserHandler {
    @PostMapping("/api/users/login")
    fun login(): Any { return "" }

    @GetMapping("/api/user")
    fun getCurrent(): Any { return "" }
}
    `;
    const tree = await parseSource(src, 'kotlin');
    const routes = await extractKotlinRoutes(tree, 'kotlin', 'UserHandler.kt');
    expect(routes).toHaveLength(2);
    expect(routes.map((r) => r.method).sort()).toEqual(['GET', 'POST']);
  });

  it('extracts bare marker annotations', async () => {
    const src = `
@RestController
class TagHandler {
    @GetMapping
    fun list(): Any { return "" }
}
    `;
    const tree = await parseSource(src, 'kotlin');
    const routes = await extractKotlinRoutes(tree, 'kotlin', 'TagHandler.kt');
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes[0].method).toBe('GET');
  });
});

// --- C# / ASP.NET Core ---

describe('extractCsharpRoutes — ASP.NET Core', () => {
  it('extracts [HttpVerb("path")] forms (V2.1.0 new feature)', async () => {
    const src = `
[Route("articles")]
public class ArticlesController : Controller
{
    [HttpGet]
    public Task Get() => null;

    [HttpGet("feed")]
    public Task GetFeed() => null;

    [HttpPost]
    public Task Create() => null;
}
    `;
    const tree = await parseSource(src, 'csharp');
    const routes = await extractCsharpRoutes(tree, 'csharp', 'ArticlesController.cs');
    expect(routes.length).toBeGreaterThanOrEqual(3);
    expect(routes.some((r) => r.method === 'GET' && r.path.includes('articles'))).toBe(true);
    expect(routes.some((r) => r.path.includes('feed'))).toBe(true);
  });

  it('joins class-level [Route] prefix with method-level path', async () => {
    const src = `
[Route("api/users")]
public class UsersController : Controller
{
    [HttpDelete("{id}")]
    public Task Delete(int id) => null;
}
    `;
    const tree = await parseSource(src, 'csharp');
    const routes = await extractCsharpRoutes(tree, 'csharp', 'UsersController.cs');
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/api/users/{id}');
  });
});

// --- PHP / Laravel ---

describe('extractPhpRoutes — Laravel', () => {
  it('extracts Route::get() with single-quoted strings (V2.1.0 fix)', async () => {
    const src = `<?php
Route::get('users', 'UserController@index');
Route::post('users/login', 'AuthController@login');
Route::delete('profiles/{user}/follow', 'ProfileController@unFollow');
    `;
    const tree = await parseSource(src, 'php');
    const routes = await extractPhpRoutes(tree, 'php', 'routes/api.php');
    expect(routes).toHaveLength(3);
    expect(routes.map((r) => r.method).sort()).toEqual(['DELETE', 'GET', 'POST']);
    expect(routes.some((r) => r.path === 'users/login')).toBe(true);
  });

  it('extracts Route::get() with double-quoted strings', async () => {
    const src = `<?php
Route::get("articles", "ArticleController@index");
    `;
    const tree = await parseSource(src, 'php');
    const routes = await extractPhpRoutes(tree, 'php', 'routes/api.php');
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('articles');
  });

  it('does NOT crash with the V2.0.x query syntax error (regression)', async () => {
    // The pre-V2.1.0 query was malformed (used member_call_expression which
    // doesn't exist in tree-sitter-php). Confirm the new query loads cleanly.
    const src = `<?php
Route::get('test', 'C@a');
    `;
    const tree = await parseSource(src, 'php');
    // Should not throw — pre-fix this would emit "Bad pattern structure" to stderr
    const routes = await extractPhpRoutes(tree, 'php', 'routes/api.php');
    expect(routes).toHaveLength(1);
  });
});

// --- Python / Django models ---

describe('extractPyModels — Django', () => {
  it('extracts Django model classes with field definitions', async () => {
    const src = `
from django.db import models

class Check(models.Model):
    name = models.CharField(max_length=100, blank=True)
    code = models.UUIDField(default=uuid.uuid4, unique=True)
    owner = models.ForeignKey(User, models.CASCADE)
    desc = models.TextField(blank=True)
    `;
    const tree = await parseSource(src, 'python');
    const models = await extractPyModels(tree, 'python', 'app/models.py');
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe('Check');
    expect(models[0].orm).toBe('django');
    const fieldNames = models[0].fields.map((f) => f.name);
    expect(fieldNames).toContain('name');
    expect(fieldNames).toContain('code');
    expect(fieldNames).toContain('owner');
    expect(fieldNames).toContain('desc');
  });

  it('flags primary key, unique, and foreign key fields', async () => {
    const src = `
class Article(models.Model):
    id = models.BigAutoField(primary_key=True)
    slug = models.CharField(max_length=200, unique=True)
    author = models.ForeignKey(User, models.CASCADE)
    body = models.TextField()
    `;
    const tree = await parseSource(src, 'python');
    const models = await extractPyModels(tree, 'python', 'app/models.py');
    expect(models).toHaveLength(1);
    const idField = models[0].fields.find((f) => f.name === 'id');
    const slugField = models[0].fields.find((f) => f.name === 'slug');
    const authorField = models[0].fields.find((f) => f.name === 'author');
    expect(idField?.attributes).toContain('PK');
    expect(slugField?.attributes).toContain('UQ');
    expect(authorField?.isRelation).toBe(true);
    expect(authorField?.attributes).toContain('FK');
  });

  it('marks blank/nullable fields as not required', async () => {
    const src = `
class Profile(models.Model):
    bio = models.TextField(blank=True)
    avatar = models.URLField(null=True)
    name = models.CharField(max_length=100)
    `;
    const tree = await parseSource(src, 'python');
    const models = await extractPyModels(tree, 'python', 'app/models.py');
    const fields = models[0].fields;
    expect(fields.find((f) => f.name === 'bio')?.required).toBe(false);
    expect(fields.find((f) => f.name === 'avatar')?.required).toBe(false);
    expect(fields.find((f) => f.name === 'name')?.required).toBe(true);
  });

  it('skips ORM-managed audit columns (createdAt etc.)', async () => {
    const src = `
class Article(models.Model):
    title = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    `;
    const tree = await parseSource(src, 'python');
    const models = await extractPyModels(tree, 'python', 'app/models.py');
    const fieldNames = models[0].fields.map((f) => f.name);
    expect(fieldNames).toContain('title');
    expect(fieldNames).not.toContain('created_at');
    expect(fieldNames).not.toContain('updated_at');
  });

  it('only runs on models.py / models/ files (path filter)', async () => {
    const src = `
class NotAModel(models.Model):
    field = models.CharField(max_length=100)
    `;
    const tree = await parseSource(src, 'python');
    // views.py is not a models file — should return 0
    const models = await extractPyModels(tree, 'python', 'app/views.py');
    expect(models).toHaveLength(0);
  });

  it('handles multiple models in one file', async () => {
    const src = `
class Check(models.Model):
    name = models.CharField(max_length=100)

class Channel(models.Model):
    kind = models.CharField(max_length=20)
    target = models.CharField(max_length=200)

class Notification(models.Model):
    error = models.CharField(max_length=200)
    `;
    const tree = await parseSource(src, 'python');
    const models = await extractPyModels(tree, 'python', 'app/models.py');
    expect(models).toHaveLength(3);
    expect(models.map((m) => m.name).sort()).toEqual(['Channel', 'Check', 'Notification']);
  });

  it('ignores classes with non-models.Model superclasses', async () => {
    const src = `
class Helper(BaseClass):
    field = models.CharField(max_length=100)

class RealModel(models.Model):
    name = models.CharField(max_length=100)
    `;
    const tree = await parseSource(src, 'python');
    const models = await extractPyModels(tree, 'python', 'app/models.py');
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe('RealModel');
  });
});

// --- Ruby / Rails routes ---

describe('extractRubyRoutes — Rails resources DSL (V2.1.1 new feature)', () => {
  it('synthesizes 7 RESTful routes from `resources :name`', async () => {
    const src = `
Rails.application.routes.draw do
  resources :articles
end
    `;
    const tree = await parseSource(src, 'ruby');
    const routes = await extractRubyRoutes(tree, 'ruby', 'config/routes.rb');
    expect(routes).toHaveLength(7);
    const sigs = routes.map((r) => `${r.method} ${r.path}`).sort();
    expect(sigs).toContain('GET /articles');
    expect(sigs).toContain('GET /articles/:id');
    expect(sigs).toContain('GET /articles/:id/edit');
    expect(sigs).toContain('GET /articles/new');
    expect(sigs).toContain('POST /articles');
    expect(sigs).toContain('PATCH /articles/:id');
    expect(sigs).toContain('DELETE /articles/:id');
  });

  it('synthesizes 6 routes from `resource :name` (singular, no index)', async () => {
    const src = `
Rails.application.routes.draw do
  resource :user
end
    `;
    const tree = await parseSource(src, 'ruby');
    const routes = await extractRubyRoutes(tree, 'ruby', 'config/routes.rb');
    expect(routes).toHaveLength(6);
    const sigs = routes.map((r) => `${r.method} ${r.path}`).sort();
    expect(sigs).toContain('GET /user');         // show (no :id for singular)
    expect(sigs).toContain('GET /user/edit');
    expect(sigs).toContain('POST /user');
    expect(sigs).toContain('PATCH /user');
    expect(sigs).toContain('DELETE /user');
    expect(sigs).not.toContain('GET /users');    // no index for singular
  });

  it('respects `only:` filter', async () => {
    const src = `
Rails.application.routes.draw do
  resources :tags, only: [:index]
end
    `;
    const tree = await parseSource(src, 'ruby');
    const routes = await extractRubyRoutes(tree, 'ruby', 'config/routes.rb');
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('GET');
    expect(routes[0].path).toBe('/tags');
  });

  it('respects `except:` filter', async () => {
    const src = `
Rails.application.routes.draw do
  resources :articles, except: [:edit, :new]
end
    `;
    const tree = await parseSource(src, 'ruby');
    const routes = await extractRubyRoutes(tree, 'ruby', 'config/routes.rb');
    expect(routes).toHaveLength(5);
    const handlers = routes.map((r) => r.handler).sort();
    expect(handlers).toEqual(['create', 'destroy', 'index', 'show', 'update']);
  });

  it('extracts symbol-style HTTP method calls (`get :feed`)', async () => {
    const src = `
Rails.application.routes.draw do
  get :feed
  post :subscribe
end
    `;
    const tree = await parseSource(src, 'ruby');
    const routes = await extractRubyRoutes(tree, 'ruby', 'config/routes.rb');
    expect(routes.length).toBeGreaterThanOrEqual(2);
    expect(routes.some((r) => r.method === 'GET' && r.path === '/feed')).toBe(true);
    expect(routes.some((r) => r.method === 'POST' && r.path === '/subscribe')).toBe(true);
  });

  it('extracts string-style routes alongside resources', async () => {
    const src = `
Rails.application.routes.draw do
  get '/health', to: 'monitoring#health'
  resources :tags, only: [:index]
end
    `;
    const tree = await parseSource(src, 'ruby');
    const routes = await extractRubyRoutes(tree, 'ruby', 'config/routes.rb');
    expect(routes.length).toBeGreaterThanOrEqual(2);
    expect(routes.some((r) => r.path === '/health')).toBe(true);
    expect(routes.some((r) => r.path === '/tags')).toBe(true);
  });

  it('only runs on routes.rb files', async () => {
    const src = `
class FoosController < ApplicationController
  resources :widgets
end
    `;
    const tree = await parseSource(src, 'ruby');
    const routes = await extractRubyRoutes(tree, 'ruby', 'app/controllers/foos_controller.rb');
    expect(routes).toHaveLength(0);
  });
});
