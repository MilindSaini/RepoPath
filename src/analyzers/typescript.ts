import { Node, Project, SyntaxKind, type CallExpression, type SourceFile } from "ts-morph";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { endpointId, GraphBuilder, type Evidence, type GraphNode } from "../model.js";
import { isTestPath, relativePath } from "../files.js";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
interface NetworkWrapper { method: string; }

export function analyzeTypeScript(root: string, files: string[], graph: GraphBuilder): void {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFiles = project.addSourceFilesAtPaths(files.filter((file) => /\.(?:[cm]?[jt]sx?)$/i.test(file)));
  const knownFiles = new Set(sourceFiles.map((sourceFile) => sourceFile.getFilePath()));
  const namedFunctions = new Map<string, GraphNode>();

  for (const sourceFile of sourceFiles) {
    const file = relativePath(root, sourceFile.getFilePath());
    graph.addNode({ id: `file:${file}`, kind: "source_file", label: file, location: location(sourceFile, file) });
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
      const name = declaration.getName();
      if (name) {
        const node = functionNode(file, name, declaration.getStartLineNumber());
        namedFunctions.set(`${file}:${name}`, node);
        graph.addNode(node);
        graph.addEdge({ source: `file:${file}`, target: node.id, relation: "DECLARES", evidence: evidence(file, declaration.getStartLineNumber(), "Function declaration") });
      }
    }
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration)) {
      const name = declaration.getName();
      const node = functionNode(file, name, declaration.getStartLineNumber());
      namedFunctions.set(`${file}:${name}`, node);
      graph.addNode(node);
      graph.addEdge({ source: `file:${file}`, target: node.id, relation: "DECLARES", evidence: evidence(file, declaration.getStartLineNumber(), "Method declaration") });
    }
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const initializer = declaration.getInitializer();
      if (!initializer || (!Node.isArrowFunction(initializer) && !Node.isFunctionExpression(initializer))) continue;
      const name = declaration.getName();
      const node = functionNode(file, name, declaration.getStartLineNumber());
      namedFunctions.set(`${file}:${name}`, node);
      graph.addNode(node);
      graph.addEdge({ source: `file:${file}`, target: node.id, relation: "DECLARES", evidence: evidence(file, declaration.getStartLineNumber(), "Function expression declaration") });
    }
  }

  const networkWrappers = collectNetworkWrappers(root, sourceFiles, namedFunctions);

  for (const sourceFile of sourceFiles) registerImports(root, sourceFile, graph, knownFiles);

  for (const sourceFile of sourceFiles) {
    registerRoutes(root, sourceFile, graph, namedFunctions);
    registerNextRoutes(root, sourceFile, graph, namedFunctions);
  }
  for (const sourceFile of sourceFiles) {
    analyzeRequests(root, sourceFile, graph);
    analyzeInternalCalls(root, sourceFile, graph, namedFunctions, networkWrappers, knownFiles);
    registerReactRenders(root, sourceFile, graph, namedFunctions, knownFiles);
  }
  for (const sourceFile of sourceFiles) {
    analyzeResponseFields(root, sourceFile, graph, namedFunctions, knownFiles);
  }
}

function registerImports(root: string, sourceFile: SourceFile, graph: GraphBuilder, knownFiles: Set<string>): void {
  const file = relativePath(root, sourceFile.getFilePath());
  for (const declaration of sourceFile.getImportDeclarations()) {
    const target = importFilePath(sourceFile, declaration.getModuleSpecifierValue(), knownFiles);
    if (!target) continue;
    const targetFile = relativePath(root, target);
    graph.addEdge({ source: `file:${file}`, target: `file:${targetFile}`, relation: "IMPORTS", evidence: evidence(file, declaration.getStartLineNumber(), `Imports ${declaration.getModuleSpecifierValue()}`) });
  }
}

function registerReactRenders(root: string, sourceFile: SourceFile, graph: GraphBuilder, namedFunctions: Map<string, GraphNode>, knownFiles: Set<string>): void {
  const file = relativePath(root, sourceFile.getFilePath());

  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    if (initializer && Node.isCallExpression(initializer)) {
      const text = initializer.getExpression().getText();
      if (text === "createContext" || text === "React.createContext") {
        const name = declaration.getName();
        const context: GraphNode = { id: `context:${name}`, kind: "context", label: name, location: { file, line: declaration.getStartLineNumber() } };
        graph.addNode(context);
      }
    }
  }

  const elements = [...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)];
  for (const element of elements) {
    const name = element.getTagNameNode().getText();
    if (!/^[A-Z]/.test(name)) continue;
    const owner = enclosingFunction(element, file);

    if (name.includes(".Provider")) {
      const contextName = name.replace(/\.Provider$/, "");
      if (owner) {
        const context: GraphNode = { id: `context:${contextName}`, kind: "context", label: contextName, location: { file, line: element.getStartLineNumber() } };
        graph.addNode(owner);
        graph.addNode(context);
        graph.addEdge({ source: owner.id, target: context.id, relation: "PROVIDES_CONTEXT", evidence: evidence(file, element.getStartLineNumber(), `${owner.label} provides ${contextName}`) });
      }
      continue;
    }

    const target = resolveFunctionTarget(root, sourceFile, name, namedFunctions, knownFiles);
    if (!owner || !target || owner.id === target.id) continue;
    graph.addNode(owner);
    graph.addEdge({ source: owner.id, target: target.id, relation: "RENDERS", evidence: evidence(file, element.getStartLineNumber(), `Renders <${name}>`) });
    for (const attribute of element.getAttributes()) {
      if (!Node.isJsxAttribute(attribute)) continue;
      const initializer = attribute.getInitializer();
      if (!initializer || !Node.isJsxExpression(initializer)) continue;
      const expression = initializer.getExpression();
      if (!expression || !Node.isIdentifier(expression)) continue;
      const callback = resolveFunctionTarget(root, sourceFile, expression.getText(), namedFunctions, knownFiles);
      if (callback) {
        graph.addNode(callback);
        graph.addEdge({ source: owner.id, target: callback.id, relation: "PASSES_CALLBACK", evidence: evidence(file, attribute.getStartLineNumber(), `Passes ${callback.label} to <${name}>`) });
      }
    }
  }
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() !== "useContext") continue;
    const argument = call.getArguments()[0];
    if (!argument) continue;
    const owner = enclosingFunction(call, file);
    if (!owner) continue;
    const contextName = argument.getText().replace(/\.Provider$/, "");
    const context: GraphNode = { id: `context:${contextName}`, kind: "context", label: contextName, location: { file, line: call.getStartLineNumber() } };
    graph.addNode(owner);
    graph.addNode(context);
    graph.addEdge({ source: owner.id, target: context.id, relation: "CONSUMES_CONTEXT", evidence: evidence(file, call.getStartLineNumber(), `Consumes ${context.label}`) });
  }
}

function registerNextRoutes(root: string, sourceFile: SourceFile, graph: GraphBuilder, namedFunctions: Map<string, GraphNode>): void {
  const file = relativePath(root, sourceFile.getFilePath());
  const normalized = `/${file}`;
  const appRoute = normalized.match(/\/app\/(.+)\/route\.[cm]?[jt]sx?$/);
  if (appRoute) {
    const path = `/${appRoute[1].replace(/\/(?:\([^/]+\)\/)?/g, "/").replace(/\[([^\]]+)\]/g, "{$1}")}`.replace(/\/+/g, "/");
    for (const declaration of sourceFile.getFunctions()) {
      const method = declaration.getName()?.toLowerCase();
      if (!method || !HTTP_METHODS.has(method)) continue;
      const endpoint = addEndpoint(graph, method, path, file, declaration.getStartLineNumber(), "Next.js App Router route handler");
      const handler = namedFunctions.get(`${file}:${declaration.getName()}`) ?? functionNode(file, declaration.getName()!, declaration.getStartLineNumber());
      graph.addNode(handler);
      graph.addEdge({ source: endpoint.id, target: handler.id, relation: "HANDLES", evidence: evidence(file, declaration.getStartLineNumber(), "Next.js App Router route handler") });
    }
    return;
  }
  const route = nextPagePath(file);
  if (route) graph.addNode({ id: `ui-route:${route}`, kind: "ui_component", label: `Next.js route ${route}`, location: { file, line: 1 } });
}

function nextPagePath(file: string): string | undefined {
  const pageMatch = file.match(/^(?:src\/)?pages\/(.+)\.[cm]?[jt]sx?$/);
  const appMatch = file.match(/^(?:src\/)?app\/(.+)\/page\.[cm]?[jt]sx?$/);
  const raw = pageMatch?.[1] ?? appMatch?.[1];
  if (!raw || raw.startsWith("api/")) return undefined;
  const path = `/${raw}`.replace(/\/index$/, "/").replace(/\[([^\]]+)\]/g, "{$1}").replace(/\/+/g, "/");
  return path === "/index" ? "/" : path;
}

function analyzeInternalCalls(root: string, sourceFile: SourceFile, graph: GraphBuilder, namedFunctions: Map<string, GraphNode>, networkWrappers: Map<string, NetworkWrapper>, knownFiles: Set<string>): void {
  const file = relativePath(root, sourceFile.getFilePath());
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const owner = enclosingFunction(call, file);
    if (!owner) continue;
    const expression = call.getExpression();
    if (Node.isIdentifier(expression)) {
      const target = resolveFunctionTarget(root, sourceFile, expression.getText(), namedFunctions, knownFiles);
      if (target && target.id !== owner.id) {
        graph.addNode(owner);
        graph.addEdge({ source: owner.id, target: target.id, relation: "CALLS", evidence: evidence(file, call.getStartLineNumber(), target.id.startsWith(`function:${file}:`) ? "Resolved local function call" : "Resolved imported function call") });
        const wrapper = networkWrappers.get(target.id);
        const path = wrapper && stringArgument(call, 0);
        if (wrapper && path) {
          addResolvedRequest(graph, owner, "REQUESTS", wrapper.method, path, file, call.getStartLineNumber(), `Request through ${target.label}() wrapper`);
        } else if (wrapper) {
          addUnresolvedRequest(graph, owner, "REQUESTS", wrapper.method, file, call.getStartLineNumber(), `Could not resolve URL passed to ${target.label}()`);
        }
      }
    }
    if (Node.isPropertyAccessExpression(expression) && isDatabaseOperation(expression.getName(), expression.getExpression().getText())) {
      const receiver = expression.getExpression().getText();
      const database: GraphNode = { id: `database:${file}:${receiver}`, kind: "database_operation", label: `${receiver}.${expression.getName()}()`, location: { file, line: call.getStartLineNumber() } };
      graph.addNode(owner);
      graph.addNode(database);
      graph.addEdge({ source: owner.id, target: database.id, relation: "TOUCHES_DATABASE", evidence: evidence(file, call.getStartLineNumber(), "Static database client operation") });
    }
  }
}

function analyzeResponseFields(root: string, sourceFile: SourceFile, graph: GraphBuilder, namedFunctions: Map<string, GraphNode>, knownFiles: Set<string>): void {
  const file = relativePath(root, sourceFile.getFilePath());
  const requestEdges = graph.getEdges().filter((e) => e.relation === "REQUESTS" || e.relation === "EXERCISES");
  const nodeById = new Map(graph.getNodes().map((n) => [n.id, n]));

  function getEndpointsForOwner(ownerId: string): string[] {
    const directRequests = requestEdges.filter((e) => e.source === ownerId);
    const endpoints: string[] = [];
    for (const req of directRequests) {
      const targetNode = nodeById.get(req.target);
      if (targetNode?.kind === "api_request" || targetNode?.kind === "api_route") {
        endpoints.push(targetNode.label);
      }
    }
    const calledFunctions = graph.getEdges().filter((e) => e.relation === "CALLS" && e.source === ownerId);
    for (const call of calledFunctions) {
      const subRequests = requestEdges.filter((e) => e.source === call.target);
      for (const req of subRequests) {
        const targetNode = nodeById.get(req.target);
        if (targetNode?.kind === "api_request" || targetNode?.kind === "api_route") {
          endpoints.push(targetNode.label);
        }
      }
    }
    return [...new Set(endpoints)];
  }

  function emitFieldRead(owner: GraphNode, endpoint: string, fieldName: string, line: number, detail: string): void {
    if (/^(then|catch|finally|toString|valueOf|constructor|prototype|length|map|filter|forEach|reduce|slice|splice|push|concat|includes|indexOf|find|findIndex)$/.test(fieldName)) return;
    const normalizedEndpoint = endpoint.replace(/^endpoint:/, "");
    const fieldId = `field:${normalizedEndpoint}:${fieldName}`;
    const field: GraphNode = {
      id: fieldId,
      kind: "api_field",
      label: `${normalizedEndpoint} response.${fieldName}`,
      location: { file, line },
      attributes: { field: fieldName, endpoint: normalizedEndpoint, source: "client_access", inferred: true },
    };
    graph.addNode(owner);
    graph.addNode(field);
    const ev: Evidence = {
      location: { file, line },
      method: "typescript_compiler",
      status: "inferred",
      confidence: "medium",
      detail: `${detail} (.${fieldName})`,
    };
    graph.addEdge({ source: owner.id, target: field.id, relation: "READS_FIELD", evidence: ev });
    graph.addEdge({ source: owner.id, target: field.id, relation: "CONSUMES_FIELD", evidence: ev });
  }

  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const owner = enclosingFunction(declaration, file);
    if (!owner) continue;
    const endpoints = getEndpointsForOwner(owner.id);
    if (!endpoints.length) continue;

    const nameNode = declaration.getNameNode();
    if (Node.isObjectBindingPattern(nameNode)) {
      for (const element of nameNode.getElements()) {
        const fieldName = element.getName();
        for (const endpoint of endpoints) {
          emitFieldRead(owner, endpoint, fieldName, element.getStartLineNumber(), "Inferred from response destructuring");
        }
      }
    }
  }

  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const propName = access.getName();
    if (propName === "data") continue;
    const owner = enclosingFunction(access, file);
    if (!owner) continue;
    const endpoints = getEndpointsForOwner(owner.id);
    if (!endpoints.length) continue;

    const parent = access.getParent();
    if (Node.isCallExpression(parent) && parent.getExpression() === access &&
        /^(then|catch|finally|toString|valueOf|map|filter|forEach|reduce|slice|splice|push|concat|includes|indexOf|find|findIndex)$/.test(propName)) {
      continue;
    }

    const exprText = access.getExpression().getText();
    if (/(?:res(?:ponse)?(?:\.data)?|data|result|json|body)$/i.test(exprText) ||
        sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).some((d) => d.getName() === exprText)) {
      for (const endpoint of endpoints) {
        emitFieldRead(owner, endpoint, propName, access.getStartLineNumber(), "Inferred from client property access");
      }
    }
  }
}

function enclosingFunction(node: Node, file: string): GraphNode | undefined {
  const ancestor = node.getFirstAncestor((parent) => Node.isFunctionDeclaration(parent) || Node.isMethodDeclaration(parent) || Node.isArrowFunction(parent) || Node.isFunctionExpression(parent));
  if (!ancestor) return undefined;
  const name = Node.isFunctionDeclaration(ancestor) || Node.isMethodDeclaration(ancestor) ? ancestor.getName() : ancestor.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();
  return name ? functionNode(file, name, ancestor.getStartLineNumber()) : undefined;
}

function collectNetworkWrappers(root: string, sourceFiles: SourceFile[], namedFunctions: Map<string, GraphNode>): Map<string, NetworkWrapper> {
  const wrappers = new Map<string, NetworkWrapper>();
  for (const sourceFile of sourceFiles) {
    const file = relativePath(root, sourceFile.getFilePath());
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getText() !== "fetch" || stringArgument(call, 0)) continue;
      const owner = enclosingFunction(call, file);
      if (!owner || !namedFunctions.has(`${file}:${owner.label}`)) continue;
      const options = call.getArguments()[1]?.getText() ?? "";
      const method = /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/i.exec(options)?.[1] ?? "GET";
      wrappers.set(owner.id, { method });
    }
  }
  return wrappers;
}

function resolveFunctionTarget(root: string, sourceFile: SourceFile, name: string, namedFunctions: Map<string, GraphNode>, knownFiles: Set<string>): GraphNode | undefined {
  const file = relativePath(root, sourceFile.getFilePath());
  const local = namedFunctions.get(`${file}:${name}`);
  if (local) return local;
  for (const declaration of sourceFile.getImportDeclarations()) {
    const named = declaration.getNamedImports().find((item) => (item.getAliasNode()?.getText() ?? item.getName()) === name);
    if (!named) continue;
    const imported = named.getName();
    const importedFile = importFilePath(sourceFile, declaration.getModuleSpecifierValue(), knownFiles);
    if (importedFile) return namedFunctions.get(`${relativePath(root, importedFile)}:${imported}`);
  }
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getDefaultImport()?.getText() !== name) continue;
    const importedFile = importFilePath(sourceFile, declaration.getModuleSpecifierValue(), knownFiles);
    if (importedFile) return namedFunctions.get(`${relativePath(root, importedFile)}:${name}`);
  }
  return undefined;
}

function importFilePath(sourceFile: SourceFile, specifier: string, knownFiles: Set<string>): string | undefined {
  return sourceFile.getImportDeclarations().find((declaration) => declaration.getModuleSpecifierValue() === specifier)?.getModuleSpecifierSourceFile()?.getFilePath() ?? localImportPath(sourceFile, specifier, knownFiles);
}

function localImportPath(sourceFile: SourceFile, specifier: string, knownFiles: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(sourceFile.getFilePath()), specifier);
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]
    .map((suffix) => `${base}${suffix}`)
    .find((candidate) => knownFiles.has(candidate));
}

function isDatabaseOperation(method: string, receiver: string): boolean {
  return /^(query|execute|find(?:Many|Unique|First)?|create|update|delete|insert|select)$/i.test(method)
    && /(?:prisma|repository|repo|database|db|knex|sequelize|model)/i.test(receiver);
}

function registerRoutes(root: string, sourceFile: SourceFile, graph: GraphBuilder, namedFunctions: Map<string, GraphNode>): void {
  const file = relativePath(root, sourceFile.getFilePath());
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const route = routeFromCall(call);
    if (!route) continue;
    const endpoint = addEndpoint(graph, route.method, route.path, file, call.getStartLineNumber(), "Express route registration");
    const handler = handlerFor(call, file, namedFunctions);
    graph.addNode(handler);
    graph.addEdge({ source: endpoint.id, target: handler.id, relation: "HANDLES", evidence: evidence(file, call.getStartLineNumber(), "Express route registration") });
  }
}

function analyzeRequests(root: string, sourceFile: SourceFile, graph: GraphBuilder): void {
  const file = relativePath(root, sourceFile.getFilePath());
  const testFile = isTestPath(file);
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const request = requestFromCall(call);
    const owner = testFile ? testOwner(call, file) : componentOwner(call, file);
    if (request) {
      if (staticAsset(request.path)) addStaticAsset(graph, root, owner, request.path, file, call.getStartLineNumber());
      else addResolvedRequest(graph, owner, testFile ? "EXERCISES" : "REQUESTS", request.method, request.path, file, call.getStartLineNumber(), request.detail);
    } else if (call.getExpression().getText() === "fetch") {
      addUnresolvedRequest(graph, owner, testFile ? "EXERCISES" : "REQUESTS", "GET", file, call.getStartLineNumber(), "Could not statically resolve fetch() URL");
    }
  }
}

function routeFromCall(call: CallExpression): { method: string; path: string } | undefined {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return undefined;
  const method = expression.getName().toLowerCase();
  if (!HTTP_METHODS.has(method)) return undefined;
  const receiver = expression.getExpression().getText();
  if (!/^(app|router|server)$/i.test(receiver)) return undefined;
  const path = stringArgument(call, 0);
  return path ? { method, path } : undefined;
}

function requestFromCall(call: CallExpression): { method: string; path: string; detail: string } | undefined {
  const expression = call.getExpression();
  if (expression.getText() === "fetch") {
    const path = stringArgument(call, 0);
    if (!path) return undefined;
    const options = call.getArguments()[1]?.getText() ?? "";
    const method = /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/i.exec(options)?.[1] ?? "GET";
    return { method, path, detail: "fetch() request" };
  }
  if (!Node.isPropertyAccessExpression(expression)) return undefined;
  const method = expression.getName().toLowerCase();
  if (!HTTP_METHODS.has(method) || expression.getExpression().getText() !== "axios") return undefined;
  const path = stringArgument(call, 0);
  return path ? { method, path, detail: `axios.${method}() request` } : undefined;
}

function stringArgument(call: CallExpression, index: number): string | undefined {
  const argument = call.getArguments()[index];
  if (!argument) return undefined;
  if (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) return argument.getLiteralValue();
  if (Node.isTemplateExpression(argument)) {
    return argument.getHead().getLiteralText() + argument.getTemplateSpans()
      .map((span) => `${templateExpression(span.getExpression())}${span.getLiteral().getLiteralText()}`)
      .join("");
  }
  return undefined;
}

function templateExpression(expression: Node): string {
  const text = expression.getText();
  if (/process\.env\.PUBLIC_URL/.test(text)) return "";
  if (Node.isIdentifier(expression)) return `{${text}}`;
  return "{value}";
}

function handlerFor(call: CallExpression, file: string, namedFunctions: Map<string, GraphNode>): GraphNode {
  const handler = call.getArguments().at(-1);
  if (handler && Node.isIdentifier(handler)) return namedFunctions.get(`${file}:${handler.getText()}`) ?? functionNode(file, handler.getText(), handler.getStartLineNumber());
  const line = handler?.getStartLineNumber() ?? call.getStartLineNumber();
  return functionNode(file, `<route handler:${line}>`, line);
}

function componentOwner(call: CallExpression, file: string): GraphNode {
  const ancestor = call.getFirstAncestor((node) => Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node));
  let name: string | undefined;
  if (ancestor && Node.isFunctionDeclaration(ancestor)) name = ancestor.getName();
  if (ancestor && (Node.isArrowFunction(ancestor) || Node.isFunctionExpression(ancestor))) {
    const variable = ancestor.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    name = variable?.getName();
  }
  const line = ancestor?.getStartLineNumber() ?? call.getStartLineNumber();
  if (name && /^[A-Z]/.test(name)) return functionNode(file, name, line);
  return { id: `file:${file}`, kind: "source_file", label: basename(file), location: { file, line: 1 } };
}

function testOwner(call: CallExpression, file: string): GraphNode {
  const testCall = call.getFirstAncestor((node) => Node.isCallExpression(node) && /^(test|it)$/.test(node.getExpression().getText()));
  const name = testCall && Node.isCallExpression(testCall) ? stringArgument(testCall, 0) : undefined;
  const line = testCall?.getStartLineNumber() ?? call.getStartLineNumber();
  const label = name ?? `${basename(file)}:${line}`;
  return { id: `test:${file}:${label}`, kind: "test", label, location: { file, line } };
}

function addEndpoint(graph: GraphBuilder, method: string, path: string, file: string, line: number, detail: string, matchExisting = false): GraphNode {
  if (matchExisting) {
    const match = graph.findMatchingEndpoint(method, path);
    if (match) return match;
  }
  const id = endpointId(method, path);
  const node: GraphNode = { id, kind: "api_route", label: id.replace("endpoint:", ""), location: { file, line } };
  graph.addNode(node);
  return node;
}

function addResolvedRequest(graph: GraphBuilder, owner: GraphNode, relation: "REQUESTS" | "EXERCISES", method: string, path: string, file: string, line: number, detail: string): void {
  const route = graph.findMatchingEndpoint(method, path);
  const normalizedMethod = method.toUpperCase();
  const requestId = `request:${file}:${line}:${normalizedMethod} ${path}`;
  const request: GraphNode = {
    id: requestId,
    kind: "api_request",
    label: route?.label ?? `${normalizedMethod} ${path}`,
    location: { file, line },
    attributes: { method: normalizedMethod, path, pathResolution: "resolved", originResolution: route ? "matched" : "unknown" },
  };
  const requestEvidence = evidence(file, line, detail);
  requestEvidence.urlTemplate = path;
  requestEvidence.resolution = "resolved";
  graph.addNode(owner);
  graph.addNode(request);
  graph.addEdge({ source: owner.id, target: request.id, relation, evidence: requestEvidence });
  if (route) {
    graph.addEdge({ source: request.id, target: route.id, relation: "TARGETS", evidence: requestEvidence });
    graph.addEdge({ source: owner.id, target: route.id, relation, evidence: requestEvidence });
  }
}

function addUnresolvedRequest(graph: GraphBuilder, owner: GraphNode, relation: "REQUESTS" | "EXERCISES", method: string, file: string, line: number, detail: string): void {
  const normalizedMethod = method.toUpperCase();
  const request: GraphNode = {
    id: `request:${file}:${line}:${normalizedMethod} <unresolved>`,
    kind: "api_request",
    label: `${normalizedMethod} <unresolved URL>`,
    location: { file, line },
    attributes: { method: normalizedMethod, pathResolution: "unresolved", originResolution: "unresolved" },
  };
  const requestEvidence = evidence(file, line, detail);
  requestEvidence.status = "unresolved";
  requestEvidence.confidence = "low";
  requestEvidence.resolution = "unresolved";
  graph.addNode(owner);
  graph.addNode(request);
  graph.addEdge({ source: owner.id, target: request.id, relation, evidence: requestEvidence });
}

function staticAsset(path: string): boolean { return !/^https?:\/\//i.test(path) && /\.(?:geojson|png|jpe?g|gif|svg|css|map|woff2?|ico)$/i.test(path.split("?")[0]); }
function addStaticAsset(graph: GraphBuilder, root: string, owner: GraphNode, path: string, file: string, line: number): void {
  const normalized = path.replace(/^\/+/, "");
  const candidates = [`public/${normalized}`, `build/${normalized}`];
  const resolved = candidates.find((candidate) => existsSync(join(root, candidate)));
  const asset: GraphNode = { id: `asset:${resolved ?? normalized}`, kind: "static_asset", label: resolved ?? path, location: { file: resolved ?? file, line: resolved ? 1 : line } };
  const assetEvidence = evidence(file, line, "Static asset fetch");
  assetEvidence.urlTemplate = path;
  assetEvidence.resolution = resolved ? "resolved" : "partially_resolved";
  assetEvidence.confidence = resolved ? "high" : "medium";
  graph.addNode(owner);
  graph.addNode(asset);
  graph.addEdge({ source: owner.id, target: asset.id, relation: "FETCHES_ASSET", evidence: assetEvidence });
}

function functionNode(file: string, name: string, line: number): GraphNode {
  return {
    id: `function:${file}:${name}`,
    kind: "function",
    label: name,
    location: { file, line },
    attributes: { isReactComponent: /^[A-Z]/.test(name), isHook: /^use[A-Z]/.test(name), isProvider: /Provider$/.test(name) },
  };
}

function location(node: Node, file: string) { return { file, line: node.getStartLineNumber() }; }
function evidence(file: string, line: number, detail: string): Evidence { return { location: { file, line }, method: "typescript_compiler", status: "statically_established", confidence: "high", detail }; }
