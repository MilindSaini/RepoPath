import { Node, Project, SyntaxKind, type CallExpression, type SourceFile } from "ts-morph";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { endpointId, GraphBuilder, type Evidence, type GraphEdge, type GraphNode } from "../model.js";
import { isTestPath, relativePath } from "../files.js";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all"]);
interface NetworkWrapper { method: string; }

function indexObjectMethods(
  prefix: string,
  objectLiteral: Node,
  file: string,
  graph: GraphBuilder,
  namedFunctions: Map<string, GraphNode>,
): void {
  if (!Node.isObjectLiteralExpression(objectLiteral)) return;
  for (const prop of objectLiteral.getProperties()) {
    if (Node.isPropertyAssignment(prop)) {
      const propName = prop.getName();
      const fullName = `${prefix}.${propName}`;
      const init = prop.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        const node = functionNode(file, fullName, prop.getStartLineNumber());
        namedFunctions.set(`${file}:${fullName}`, node);
        graph.addNode(node);
        graph.addEdge({
          source: `file:${file}`,
          target: node.id,
          relation: "DECLARES",
          evidence: evidence(file, prop.getStartLineNumber(), "Object method declaration"),
        });
      } else if (init && Node.isObjectLiteralExpression(init)) {
        indexObjectMethods(fullName, init, file, graph, namedFunctions);
      }
    } else if (Node.isMethodDeclaration(prop)) {
      const propName = prop.getName();
      const fullName = `${prefix}.${propName}`;
      const node = functionNode(file, fullName, prop.getStartLineNumber());
      namedFunctions.set(`${file}:${fullName}`, node);
      graph.addNode(node);
      graph.addEdge({
        source: `file:${file}`,
        target: node.id,
        relation: "DECLARES",
        evidence: evidence(file, prop.getStartLineNumber(), "Object method declaration"),
      });
    }
  }
}

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
      if (!initializer) continue;
      if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) {
        const name = declaration.getName();
        const node = functionNode(file, name, declaration.getStartLineNumber());
        namedFunctions.set(`${file}:${name}`, node);
        graph.addNode(node);
        graph.addEdge({ source: `file:${file}`, target: node.id, relation: "DECLARES", evidence: evidence(file, declaration.getStartLineNumber(), "Function expression declaration") });
      } else if (Node.isObjectLiteralExpression(initializer)) {
        const name = declaration.getName();
        indexObjectMethods(name, initializer, file, graph, namedFunctions);
      }
    }
  }

  const networkWrappers = collectNetworkWrappers(root, sourceFiles, namedFunctions, knownFiles);
  const targetCache = new Map<string, GraphNode | undefined>();
  const importCache = new Map<string, string | undefined>();

  for (const sourceFile of sourceFiles) registerImports(root, sourceFile, graph, knownFiles, importCache);

  const mountPrefixes = collectMountedRouterPrefixes(root, sourceFiles, knownFiles);

  for (const sourceFile of sourceFiles) {
    registerRoutes(root, sourceFile, graph, namedFunctions, mountPrefixes, knownFiles);
    registerNextRoutes(root, sourceFile, graph, namedFunctions);
  }
  for (const sourceFile of sourceFiles) {
    analyzeRequests(root, sourceFile, graph, networkWrappers, knownFiles);
    analyzeInternalCalls(root, sourceFile, graph, namedFunctions, networkWrappers, knownFiles, targetCache, importCache);
    registerReactRenders(root, sourceFile, graph, namedFunctions, knownFiles, targetCache, importCache);
    if (isTestPath(relativePath(root, sourceFile.getFilePath()))) {
      discoverTests(root, sourceFile, graph, namedFunctions, knownFiles);
    }
  }

  const requestEdges = graph.getEdges().filter((e) => e.relation === "REQUESTS" || e.relation === "EXERCISES");
  const nodeById = new Map(graph.getNodes().map((n) => [n.id, n]));
  const calledFunctionsBySource = new Map<string, GraphEdge[]>();
  for (const edge of graph.getEdges()) {
    if (edge.relation === "CALLS") {
      let list = calledFunctionsBySource.get(edge.source);
      if (!list) { list = []; calledFunctionsBySource.set(edge.source, list); }
      list.push(edge);
    }
  }
  const endpointCache = new Map<string, string[]>();

  for (const sourceFile of sourceFiles) {
    analyzeResponseFields(root, sourceFile, graph, namedFunctions, knownFiles, requestEdges, nodeById, calledFunctionsBySource, endpointCache);
  }
}

function registerImports(root: string, sourceFile: SourceFile, graph: GraphBuilder, knownFiles: Set<string>, importCache?: Map<string, string | undefined>): void {
  const file = relativePath(root, sourceFile.getFilePath());
  for (const declaration of sourceFile.getImportDeclarations()) {
    const target = importFilePath(sourceFile, declaration.getModuleSpecifierValue(), knownFiles, importCache);
    if (!target) continue;
    const targetFile = relativePath(root, target);
    graph.addEdge({ source: `file:${file}`, target: `file:${targetFile}`, relation: "IMPORTS", evidence: evidence(file, declaration.getStartLineNumber(), `Imports ${declaration.getModuleSpecifierValue()}`) });
  }
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() === "require") {
      const arg = call.getArguments()[0];
      if (arg && (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))) {
        const specifier = arg.getLiteralValue();
        const target = importFilePath(sourceFile, specifier, knownFiles, importCache);
        if (target) {
          const targetFile = relativePath(root, target);
          graph.addEdge({ source: `file:${file}`, target: `file:${targetFile}`, relation: "IMPORTS", evidence: evidence(file, call.getStartLineNumber(), `Requires ${specifier}`) });
        }
      }
    }
  }
}

function registerReactRenders(
  root: string,
  sourceFile: SourceFile,
  graph: GraphBuilder,
  namedFunctions: Map<string, GraphNode>,
  knownFiles: Set<string>,
  targetCache?: Map<string, GraphNode | undefined>,
  importCache?: Map<string, string | undefined>,
): void {
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

    const target = resolveFunctionTarget(root, sourceFile, name, namedFunctions, knownFiles, targetCache, importCache);
    if (!owner || !target || owner.id === target.id) continue;
    graph.addNode(owner);
    graph.addEdge({ source: owner.id, target: target.id, relation: "RENDERS", evidence: evidence(file, element.getStartLineNumber(), `Renders <${name}>`) });
    for (const attribute of element.getAttributes()) {
      if (!Node.isJsxAttribute(attribute)) continue;
      const initializer = attribute.getInitializer();
      if (!initializer || !Node.isJsxExpression(initializer)) continue;
      const expression = initializer.getExpression();
      if (!expression || !Node.isIdentifier(expression)) continue;
      const callback = resolveFunctionTarget(root, sourceFile, expression.getText(), namedFunctions, knownFiles, targetCache, importCache);
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

function analyzeInternalCalls(
  root: string,
  sourceFile: SourceFile,
  graph: GraphBuilder,
  namedFunctions: Map<string, GraphNode>,
  networkWrappers: Map<string, NetworkWrapper>,
  knownFiles: Set<string>,
  targetCache?: Map<string, GraphNode | undefined>,
  importCache?: Map<string, string | undefined>,
): void {
  const file = relativePath(root, sourceFile.getFilePath());
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const owner = enclosingFunction(call, file);
    if (!owner) continue;
    const expression = call.getExpression();

    let callName: string | undefined;
    if (Node.isIdentifier(expression)) {
      callName = expression.getText();
    } else if (Node.isPropertyAccessExpression(expression)) {
      const text = expression.getText();
      if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(text) && !isDatabaseOperation(expression.getName(), expression.getExpression().getText())) {
        callName = text;
      }
    }

    if (callName) {
      const target = resolveFunctionTarget(root, sourceFile, callName, namedFunctions, knownFiles, targetCache, importCache);
      if (target && target.id !== owner.id) {
        graph.addNode(owner);
        graph.addEdge({ source: owner.id, target: target.id, relation: "CALLS", evidence: evidence(file, call.getStartLineNumber(), target.id.startsWith(`function:${file}:`) ? "Resolved local function call" : "Resolved imported function call") });
        const wrapper = networkWrappers.get(target.id);
        const path = wrapper && stringArgument(call, 0, knownFiles);
        if (wrapper && path) {
          if (staticAsset(path)) {
            addStaticAsset(graph, root, owner, path, file, call.getStartLineNumber());
          } else {
            addResolvedRequest(graph, owner, "REQUESTS", wrapper.method, path, file, call.getStartLineNumber(), `Request through ${target.label}() wrapper`);
          }
        } else if (wrapper) {
          addUnresolvedRequest(graph, owner, "REQUESTS", wrapper.method, file, call.getStartLineNumber(), `Could not resolve URL passed to ${target.label}()`);
        }
      }
    }

    if (Node.isPropertyAccessExpression(expression) && isDatabaseOperation(expression.getName(), expression.getExpression().getText())) {
      const receiver = expression.getExpression().getText();
      let queryString: string | undefined;
      const arg0 = call.getArguments()[0];
      if (arg0) {
        queryString = extractStringValue(arg0, knownFiles);
        if (!queryString && Node.isIdentifier(arg0)) {
          const varName = arg0.getText();
          const varDecl = sourceFile.getVariableDeclaration(varName)
            ?? call.getFirstAncestorByKind(SyntaxKind.Block)?.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((d) => d.getName() === varName)
            ?? sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((d) => d.getName() === varName);
          if (varDecl) {
            queryString = extractStringValue(varDecl.getInitializer(), knownFiles);
          }
        }
      }
      const database: GraphNode = {
        id: `database:${file}:${receiver}:${call.getStartLineNumber()}`,
        kind: "database_operation",
        label: `${receiver}.${expression.getName()}()`,
        location: { file, line: call.getStartLineNumber() },
        attributes: queryString ? { query: queryString } : undefined,
      };
      graph.addNode(owner);
      graph.addNode(database);
      graph.addEdge({ source: owner.id, target: database.id, relation: "TOUCHES_DATABASE", evidence: evidence(file, call.getStartLineNumber(), "Static database client operation") });
    }
  }
}

function analyzeResponseFields(
  root: string,
  sourceFile: SourceFile,
  graph: GraphBuilder,
  namedFunctions: Map<string, GraphNode>,
  knownFiles: Set<string>,
  requestEdges: GraphEdge[],
  nodeById: Map<string, GraphNode>,
  calledFunctionsBySource: Map<string, GraphEdge[]>,
  endpointCache: Map<string, string[]>,
): void {
  const file = relativePath(root, sourceFile.getFilePath());

  function getEndpointsForOwner(ownerId: string): string[] {
    const cached = endpointCache.get(ownerId);
    if (cached) return cached;
    const directRequests = requestEdges.filter((e) => e.source === ownerId);
    const endpoints: string[] = [];
    for (const req of directRequests) {
      const targetNode = nodeById.get(req.target);
      if (targetNode?.kind === "api_request" || targetNode?.kind === "api_route") {
        endpoints.push(targetNode.label);
      }
    }
    const calledFunctions = calledFunctionsBySource.get(ownerId) ?? [];
    for (const call of calledFunctions) {
      const subRequests = requestEdges.filter((e) => e.source === call.target);
      for (const req of subRequests) {
        const targetNode = nodeById.get(req.target);
        if (targetNode?.kind === "api_request" || targetNode?.kind === "api_route") {
          endpoints.push(targetNode.label);
        }
      }
    }
    const unique = [...new Set(endpoints)];
    endpointCache.set(ownerId, unique);
    return unique;
  }

  function emitFieldRead(owner: GraphNode, endpoint: string, fieldName: string, line: number, detail: string): void {
    if (/^(then|catch|finally|toString|valueOf|constructor|prototype|length|map|filter|forEach|reduce|slice|splice|push|concat|includes|indexOf|find|findIndex|trim|toLowerCase|toUpperCase|replace|replaceAll|split|join|json|text|blob|arrayBuffer|formData|ok|status|statusText|headers)$/.test(fieldName)) return;
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
  }

  function emitQueryParameter(owner: GraphNode, endpoint: string, paramName: string, line: number, detail: string): void {
    if (/^(then|catch|finally|toString|valueOf|constructor|prototype|length|trim|toLowerCase|toUpperCase|replace|replaceAll|split|join|json|text|blob|arrayBuffer|formData|ok|status|statusText|headers)$/.test(paramName)) return;
    const normalizedEndpoint = endpoint.replace(/^endpoint:/, "");
    const paramId = `param:${normalizedEndpoint}:${paramName}`;
    const paramNode: GraphNode = {
      id: paramId,
      kind: "query_parameter",
      label: `${normalizedEndpoint} param.${paramName}`,
      location: { file, line },
      attributes: { parameter: paramName, endpoint: normalizedEndpoint, source: "client_request", inferred: true },
    };
    graph.addNode(owner);
    graph.addNode(paramNode);
    const ev: Evidence = {
      location: { file, line },
      method: "typescript_compiler",
      status: "inferred",
      confidence: "medium",
      detail: `${detail} (${paramName})`,
    };
    graph.addEdge({ source: owner.id, target: paramNode.id, relation: "SENDS_PARAMETER", evidence: ev });
  }

  // 1. Request parameters from Axios config object: { params: { dateFrom, dateTo, ... } }
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const owner = enclosingFunction(call, file);
    if (!owner) continue;
    const endpoints = getEndpointsForOwner(owner.id);
    if (!endpoints.length) continue;

    for (const arg of call.getArguments()) {
      if (Node.isObjectLiteralExpression(arg)) {
        const paramsProp = arg.getProperty("params");
        if (paramsProp && Node.isPropertyAssignment(paramsProp)) {
          const init = paramsProp.getInitializer();
          if (init && Node.isObjectLiteralExpression(init)) {
            for (const prop of init.getProperties()) {
              if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
                for (const endpoint of endpoints) {
                  emitQueryParameter(owner, endpoint, prop.getName(), prop.getStartLineNumber(), "Axios request params");
                }
              }
            }
          }
        }
      }
    }
  }

  // 2. Destructuring: distinguish response vs request params
  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const owner = enclosingFunction(declaration, file);
    if (!owner) continue;
    const endpoints = getEndpointsForOwner(owner.id);
    if (!endpoints.length) continue;

    const initializer = declaration.getInitializer();
    const initText = initializer?.getText() ?? "";
    const isParamInit = /(?:params|query|filter|filters|options|searchParams)$/i.test(initText);

    const nameNode = declaration.getNameNode();
    if (Node.isObjectBindingPattern(nameNode)) {
      for (const element of nameNode.getElements()) {
        const fieldName = element.getName();
        if (isParamInit || /^(?:dateFrom|dateTo|geoOnly|minConfidence)$/i.test(fieldName)) {
          for (const endpoint of endpoints) {
            emitQueryParameter(owner, endpoint, fieldName, element.getStartLineNumber(), "Inferred from request param destructuring");
          }
        } else {
          for (const endpoint of endpoints) {
            emitFieldRead(owner, endpoint, fieldName, element.getStartLineNumber(), "Inferred from response destructuring");
          }
        }
      }
    }
  }

  // 3. Property access expressions: response vs query params
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const propName = access.getName();
    if (propName === "data") continue;
    const owner = enclosingFunction(access, file);
    if (!owner) continue;
    const endpoints = getEndpointsForOwner(owner.id);
    if (!endpoints.length) continue;

    const parent = access.getParent();
    if (Node.isCallExpression(parent) && parent.getExpression() === access &&
        /^(then|catch|finally|toString|valueOf|map|filter|forEach|reduce|slice|splice|push|concat|includes|indexOf|find|findIndex|trim|toLowerCase|toUpperCase|replace|replaceAll|split|join|json|text|blob|arrayBuffer|formData)$/.test(propName)) {
      continue;
    }

    const exprText = access.getExpression().getText();
    if (/^(?:params|query|filter|filters|options|searchParams|req\.query|req\.params)$/i.test(exprText) ||
        /^(?:dateFrom|dateTo|geoOnly|minConfidence)$/i.test(propName)) {
      for (const endpoint of endpoints) {
        emitQueryParameter(owner, endpoint, propName, access.getStartLineNumber(), "Inferred from client query parameter access");
      }
    } else if (exprText !== "JSON" && /(?:res(?:ponse)?(?:\.data)?|data|result|json|body)$/i.test(exprText)) {
      if (/^(?:json|text|blob|arrayBuffer|formData|ok|status|statusText|headers)$/.test(propName)) continue;
      for (const endpoint of endpoints) {
        emitFieldRead(owner, endpoint, propName, access.getStartLineNumber(), "Inferred from client property access");
      }
    }
  }
}

function enclosingFunction(node: Node, file: string): GraphNode | undefined {
  const ancestor = node.getFirstAncestor((parent) => Node.isFunctionDeclaration(parent) || Node.isMethodDeclaration(parent) || Node.isArrowFunction(parent) || Node.isFunctionExpression(parent));
  if (!ancestor) return undefined;
  if (Node.isFunctionDeclaration(ancestor) || Node.isMethodDeclaration(ancestor)) {
    const name = ancestor.getName();
    return name ? functionNode(file, name, ancestor.getStartLineNumber()) : undefined;
  }
  const prop = ancestor.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
  if (prop) {
    let path = prop.getName();
    let current: Node | undefined = prop.getParent();
    while (current && Node.isObjectLiteralExpression(current)) {
      const parentProp = current.getParent();
      if (parentProp && Node.isPropertyAssignment(parentProp)) {
        path = `${parentProp.getName()}.${path}`;
        current = parentProp.getParent();
      } else if (parentProp && Node.isVariableDeclaration(parentProp)) {
        path = `${parentProp.getName()}.${path}`;
        break;
      } else {
        break;
      }
    }
    return functionNode(file, path, prop.getStartLineNumber());
  }
  const name = ancestor.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();
  return name ? functionNode(file, name, ancestor.getStartLineNumber()) : undefined;
}

function collectNetworkWrappers(
  root: string,
  sourceFiles: SourceFile[],
  namedFunctions: Map<string, GraphNode>,
  knownFiles: Set<string>,
): Map<string, NetworkWrapper> {
  const wrappers = new Map<string, NetworkWrapper>();
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 5) {
    changed = false;
    iterations++;
    for (const sourceFile of sourceFiles) {
      const file = relativePath(root, sourceFile.getFilePath());
      for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expr = call.getExpression();
        const exprText = expr.getText();
        let method: string | undefined;

        if (exprText === "fetch") {
          if (stringArgument(call, 0, knownFiles)) continue;
          const arg1 = call.getArguments()[1];
          let m = "GET";
          if (arg1) {
            const optionsText = arg1.getText();
            const match = /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/i.exec(optionsText);
            if (match) m = match[1].toUpperCase();
          }
          method = m;
        } else {
          const target = resolveFunctionTarget(root, sourceFile, exprText, namedFunctions, knownFiles);
          if (target && wrappers.has(target.id) && !stringArgument(call, 0, knownFiles)) {
            method = wrappers.get(target.id)!.method;
          }
        }

        if (!method) continue;

        let current: Node | undefined = call;
        while (current) {
          const ancestor: Node | undefined = current.getFirstAncestor(
            (p) => Node.isFunctionDeclaration(p) || Node.isMethodDeclaration(p) || Node.isArrowFunction(p) || Node.isFunctionExpression(p),
          );
          if (!ancestor) break;
          const name = Node.isFunctionDeclaration(ancestor) || Node.isMethodDeclaration(ancestor)
            ? ancestor.getName()
            : ancestor.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();
          if (name) {
            const owner = namedFunctions.get(`${file}:${name}`);
            if (owner && !wrappers.has(owner.id)) {
              wrappers.set(owner.id, { method });
              changed = true;
            }
          }
          current = ancestor.getParent();
        }
      }
    }
  }
  return wrappers;
}

function resolveFunctionTarget(
  root: string,
  sourceFile: SourceFile,
  name: string,
  namedFunctions: Map<string, GraphNode>,
  knownFiles: Set<string>,
  targetCache?: Map<string, GraphNode | undefined>,
  importCache?: Map<string, string | undefined>,
): GraphNode | undefined {
  const file = relativePath(root, sourceFile.getFilePath());
  const local = namedFunctions.get(`${file}:${name}`);
  if (local) return local;

  const cacheKey = targetCache ? `${file}:${name}` : undefined;
  if (cacheKey && targetCache!.has(cacheKey)) return targetCache!.get(cacheKey);

  const dotIdx = name.indexOf(".");
  const rootName = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const propChain = dotIdx >= 0 ? name.slice(dotIdx) : "";

  for (const declaration of sourceFile.getImportDeclarations()) {
    const named = declaration.getNamedImports().find((item) => (item.getAliasNode()?.getText() ?? item.getName()) === rootName);
    if (!named) continue;
    const imported = named.getName();
    const importedFile = importFilePath(sourceFile, declaration.getModuleSpecifierValue(), knownFiles, importCache);
    if (importedFile) {
      const node = namedFunctions.get(`${relativePath(root, importedFile)}:${imported}${propChain}`)
        ?? namedFunctions.get(`${relativePath(root, importedFile)}:${imported}`);
      if (cacheKey) targetCache!.set(cacheKey, node);
      return node;
    }
  }
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getDefaultImport()?.getText() !== rootName) continue;
    const importedFile = importFilePath(sourceFile, declaration.getModuleSpecifierValue(), knownFiles, importCache);
    if (importedFile) {
      const node = namedFunctions.get(`${relativePath(root, importedFile)}:${rootName}${propChain}`)
        ?? namedFunctions.get(`${relativePath(root, importedFile)}:${rootName}`);
      if (cacheKey) targetCache!.set(cacheKey, node);
      return node;
    }
  }

  for (const varDecl of sourceFile.getVariableDeclarations()) {
    if (varDecl.getName() === rootName) {
      const init = varDecl.getInitializer();
      if (init && Node.isCallExpression(init) && init.getExpression().getText() === "require") {
        const specifier = init.getArguments()[0];
        if (specifier && (Node.isStringLiteral(specifier) || Node.isNoSubstitutionTemplateLiteral(specifier))) {
          const importedFile = importFilePath(sourceFile, specifier.getLiteralValue(), knownFiles, importCache);
          if (importedFile) {
            const node = namedFunctions.get(`${relativePath(root, importedFile)}:${rootName}${propChain}`)
              ?? namedFunctions.get(`${relativePath(root, importedFile)}:${rootName}`);
            if (cacheKey) targetCache!.set(cacheKey, node);
            return node;
          }
        }
      }
    }
  }

  if (cacheKey) targetCache!.set(cacheKey, undefined);
  return undefined;
}

function importFilePath(
  sourceFile: SourceFile,
  specifier: string,
  knownFiles: Set<string>,
  importCache?: Map<string, string | undefined>,
): string | undefined {
  const cacheKey = importCache ? `${sourceFile.getFilePath()}|${specifier}` : undefined;
  if (cacheKey && importCache!.has(cacheKey)) return importCache!.get(cacheKey);

  const local = localImportPath(sourceFile, specifier, knownFiles);
  if (local) {
    if (cacheKey) importCache!.set(cacheKey, local);
    return local;
  }
  if (!specifier.startsWith(".")) {
    if (cacheKey) importCache!.set(cacheKey, undefined);
    return undefined;
  }
  const resolved = sourceFile.getImportDeclarations().find((declaration) => declaration.getModuleSpecifierValue() === specifier)?.getModuleSpecifierSourceFile()?.getFilePath();
  const result = resolved && knownFiles.has(resolved) ? resolved : undefined;
  if (cacheKey) importCache!.set(cacheKey, result);
  return result;
}

function localImportPath(sourceFile: SourceFile, specifier: string, knownFiles: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(sourceFile.getFilePath()), specifier);
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]
    .map((suffix) => `${base}${suffix}`)
    .find((candidate) => knownFiles.has(candidate));
}

function isDatabaseOperation(method: string, receiver: string): boolean {
  return /^(query|execute|find(?:Many|Unique|First)?|create|update|delete|insert|select|all|get|run|exec)$/i.test(method)
    && /(?:prisma|repository|repo|database|db|knex|sequelize|model|pool|connection|conn|client)/i.test(receiver);
}

function registerRoutes(
  root: string,
  sourceFile: SourceFile,
  graph: GraphBuilder,
  namedFunctions: Map<string, GraphNode>,
  mountPrefixes?: { filePrefixes: Map<string, string[]>; routerPrefixes: Map<string, string[]> },
  knownFiles?: Set<string>,
): void {
  const file = relativePath(root, sourceFile.getFilePath());
  const fileLevelPrefixes = mountPrefixes?.filePrefixes.get(file);
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const route = routeFromCall(call, knownFiles);
    if (!route) continue;
    const routerPrefix = route.receiver ? mountPrefixes?.routerPrefixes.get(`${file}:${route.receiver}`) : undefined;
    const prefixes = routerPrefix ?? fileLevelPrefixes ?? [""];
    for (const routePath of route.paths) {
      for (const prefix of prefixes) {
        const fullPath = prefix ? joinPaths(prefix, routePath) : routePath;
        const endpoint = addEndpoint(graph, route.method, fullPath, file, call.getStartLineNumber(), "Express route registration");
        const handler = handlerFor(call, file, namedFunctions);
        graph.addNode(handler);
        graph.addEdge({ source: endpoint.id, target: handler.id, relation: "HANDLES", evidence: evidence(file, call.getStartLineNumber(), "Express route registration") });
      }
    }
  }
}

function collectMountedRouterPrefixes(root: string, sourceFiles: SourceFile[], knownFiles: Set<string>): { filePrefixes: Map<string, string[]>; routerPrefixes: Map<string, string[]> } {
  const filePrefixes = new Map<string, string[]>();
  const routerPrefixes = new Map<string, string[]>();

  for (const sourceFile of sourceFiles) {
    const file = relativePath(root, sourceFile.getFilePath());
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression();
      if (!Node.isPropertyAccessExpression(expression)) continue;
      if (expression.getName() !== "use") continue;
      const receiver = expression.getExpression().getText();
      if (!/^(app|router|server)$/i.test(receiver) && !/router$/i.test(receiver)) continue;

      const args = call.getArguments();
      if (args.length < 2) continue;
      const prefix = stringArgument(call, 0);
      if (!prefix || !prefix.startsWith("/")) continue;

      const routerArg = args[1];
      if (Node.isIdentifier(routerArg)) {
        const routerName = routerArg.getText();
        let localList = routerPrefixes.get(`${file}:${routerName}`);
        if (!localList) { localList = []; routerPrefixes.set(`${file}:${routerName}`, localList); }
        if (!localList.includes(prefix)) localList.push(prefix);

        for (const decl of sourceFile.getImportDeclarations()) {
          const defaultImport = decl.getDefaultImport()?.getText();
          const namedImport = decl.getNamedImports().find((n) => (n.getAliasNode()?.getText() ?? n.getName()) === routerName);
          if (defaultImport === routerName || namedImport) {
            const importedFile = importFilePath(sourceFile, decl.getModuleSpecifierValue(), knownFiles);
            if (importedFile) {
              const rel = relativePath(root, importedFile);
              let list = filePrefixes.get(rel);
              if (!list) { list = []; filePrefixes.set(rel, list); }
              if (!list.includes(prefix)) list.push(prefix);
            }
          }
        }

        for (const varDecl of sourceFile.getVariableDeclarations()) {
          if (varDecl.getName() === routerName) {
            const init = varDecl.getInitializer();
            if (init && Node.isCallExpression(init) && init.getExpression().getText() === "require") {
              const specifier = init.getArguments()[0];
              if (specifier && (Node.isStringLiteral(specifier) || Node.isNoSubstitutionTemplateLiteral(specifier))) {
                const importedFile = importFilePath(sourceFile, specifier.getLiteralValue(), knownFiles);
                if (importedFile) {
                  const rel = relativePath(root, importedFile);
                  let list = filePrefixes.get(rel);
                  if (!list) { list = []; filePrefixes.set(rel, list); }
                  if (!list.includes(prefix)) list.push(prefix);
                }
              }
            }
          }
        }
      } else if (Node.isCallExpression(routerArg) && routerArg.getExpression().getText() === "require") {
        const specifier = routerArg.getArguments()[0];
        if (specifier && (Node.isStringLiteral(specifier) || Node.isNoSubstitutionTemplateLiteral(specifier))) {
          const importedFile = importFilePath(sourceFile, specifier.getLiteralValue(), knownFiles);
          if (importedFile) {
            const rel = relativePath(root, importedFile);
            let list = filePrefixes.get(rel);
            if (!list) { list = []; filePrefixes.set(rel, list); }
            if (!list.includes(prefix)) list.push(prefix);
          }
        }
      }
    }
  }
  return { filePrefixes, routerPrefixes };
}

function joinPaths(prefix: string, path: string): string {
  const p1 = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const p2 = path.startsWith("/") ? path : `/${path}`;
  return `${p1}${p2}`.replace(/\/+/g, "/");
}

function discoverTests(root: string, sourceFile: SourceFile, graph: GraphBuilder, namedFunctions: Map<string, GraphNode>, knownFiles: Set<string>): void {
  const file = relativePath(root, sourceFile.getFilePath());
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    if (!/^(?:test|it)(?:\.(?:only|skip|todo|concurrent))?$/.test(exprText)) continue;
    const testName = stringArgument(call, 0);
    if (!testName) continue;
    const line = call.getStartLineNumber();
    const testNode: GraphNode = {
      id: `test:${file}:${testName}`,
      kind: "test",
      label: testName,
      location: { file, line },
    };
    graph.addNode(testNode);

    let exercisedAny = false;
    for (const innerCall of call.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (innerCall === call) continue;
      const req = requestFromCall(innerCall);
      if (req) {
        exercisedAny = true;
        const endpoint = addEndpoint(graph, req.method, req.path, file, innerCall.getStartLineNumber(), req.detail, true);
        graph.addEdge({
          source: testNode.id,
          target: endpoint.id,
          relation: "EXERCISES",
          evidence: evidence(file, innerCall.getStartLineNumber(), `Test exercises ${req.method} ${req.path}`),
        });
      }

      const innerExprText = innerCall.getExpression().getText();
      if (/^(?:render|mount|shallow)$/.test(innerExprText)) {
        const jsxElements = [
          ...innerCall.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
          ...innerCall.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
        ];
        for (const el of jsxElements) {
          const compName = el.getTagNameNode().getText();
          if (/^[A-Z]/.test(compName)) {
            const target = resolveFunctionTarget(root, sourceFile, compName, namedFunctions, knownFiles);
            if (target) {
              exercisedAny = true;
              graph.addEdge({
                source: testNode.id,
                target: target.id,
                relation: "EXERCISES",
                evidence: evidence(file, el.getStartLineNumber(), `Test exercises <${compName}>`),
              });
            }
          }
        }
      }

      if (Node.isIdentifier(innerCall.getExpression())) {
        const fnName = innerCall.getExpression().getText();
        const target = resolveFunctionTarget(root, sourceFile, fnName, namedFunctions, knownFiles);
        if (target && !target.id.includes(file)) {
          exercisedAny = true;
          graph.addEdge({
            source: testNode.id,
            target: target.id,
            relation: "EXERCISES",
            evidence: evidence(file, innerCall.getStartLineNumber(), `Test exercises ${target.label}()`),
          });
        }
      }
    }

    if (!exercisedAny) {
      for (const decl of sourceFile.getImportDeclarations()) {
        const target = importFilePath(sourceFile, decl.getModuleSpecifierValue(), knownFiles);
        if (target) {
          const targetFile = relativePath(root, target);
          if (!isTestPath(targetFile)) {
            graph.addEdge({
              source: testNode.id,
              target: `file:${targetFile}`,
              relation: "EXERCISES",
              evidence: evidence(file, decl.getStartLineNumber(), `Test file imports ${targetFile}`),
            });
          }
        }
      }
    }
  }
}

function analyzeRequests(
  root: string,
  sourceFile: SourceFile,
  graph: GraphBuilder,
  networkWrappers: Map<string, NetworkWrapper>,
  knownFiles: Set<string>,
): void {
  const file = relativePath(root, sourceFile.getFilePath());
  const testFile = isTestPath(file);
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const request = requestFromCall(call, knownFiles);
    const owner = testFile ? testOwner(call, file) : componentOwner(call, file);
    if (request) {
      if (staticAsset(request.path)) addStaticAsset(graph, root, owner, request.path, file, call.getStartLineNumber());
      else addResolvedRequest(graph, owner, testFile ? "EXERCISES" : "REQUESTS", request.method, request.path, file, call.getStartLineNumber(), request.detail);
    } else if (call.getExpression().getText() === "fetch") {
      if (networkWrappers.has(owner.id)) continue;
      const options = call.getArguments()[1]?.getText() ?? "";
      const method = /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/i.exec(options)?.[1]?.toUpperCase() ?? "GET";
      addUnresolvedRequest(graph, owner, testFile ? "EXERCISES" : "REQUESTS", method, file, call.getStartLineNumber(), "Could not statically resolve fetch() URL");
    }
  }
}

function routeFromCall(call: CallExpression, knownFiles?: Set<string>): { method: string; paths: string[]; receiver: string } | undefined {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return undefined;
  const method = expression.getName().toLowerCase();
  if (!HTTP_METHODS.has(method)) return undefined;
  const receiver = expression.getExpression().getText();
  if (!/^(app|router|server)$/i.test(receiver) && !/router$/i.test(receiver)) return undefined;

  const arg0 = call.getArguments()[0];
  if (!arg0) return undefined;
  if (Node.isArrayLiteralExpression(arg0)) {
    const paths: string[] = [];
    for (const el of arg0.getElements()) {
      const val = extractStringValue(el, knownFiles);
      if (val) paths.push(val);
    }
    return paths.length ? { method, paths, receiver } : undefined;
  }
  const path = extractStringValue(arg0, knownFiles);
  return path ? { method, paths: [path], receiver } : undefined;
}

function requestFromCall(call: CallExpression, knownFiles?: Set<string>): { method: string; path: string; detail: string } | undefined {
  const expression = call.getExpression();
  if (expression.getText() === "fetch") {
    const path = stringArgument(call, 0, knownFiles);
    if (!path) return undefined;
    const arg1 = call.getArguments()[1];
    let method = "get";
    if (arg1) {
      if (Node.isObjectLiteralExpression(arg1)) {
        const methodProp = arg1.getProperty("method");
        if (methodProp && Node.isPropertyAssignment(methodProp)) {
          const val = extractStringValue(methodProp.getInitializer(), knownFiles);
          if (val) method = val.toLowerCase();
        }
      }
      if (method === "get") {
        const options = arg1.getText();
        const match = /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/i.exec(options);
        if (match) method = match[1].toLowerCase();
      }
    }
    return { method, path, detail: "fetch() request" };
  }
  if (expression.getText() === "axios") {
    const arg0 = call.getArguments()[0];
    if (arg0 && Node.isObjectLiteralExpression(arg0)) {
      const urlProp = arg0.getProperty("url");
      const path = urlProp && Node.isPropertyAssignment(urlProp) ? extractStringValue(urlProp.getInitializer(), knownFiles) : undefined;
      if (!path) return undefined;
      const methodProp = arg0.getProperty("method");
      let method = "get";
      if (methodProp && Node.isPropertyAssignment(methodProp)) {
        const methodVal = extractStringValue(methodProp.getInitializer(), knownFiles);
        if (methodVal) {
          method = methodVal.toLowerCase();
        } else {
          const text = methodProp.getInitializer()?.getText();
          if (text && /method/i.test(text)) method = "all";
        }
      }
      return { method, path, detail: "axios() request" };
    } else if (arg0) {
      const path = extractStringValue(arg0, knownFiles);
      if (path) {
        const options = call.getArguments()[1]?.getText() ?? "";
        const method = /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)["'`]/i.exec(options)?.[1]?.toLowerCase() ?? "get";
        return { method, path, detail: "axios() request" };
      }
    }
    return undefined;
  }
  if (!Node.isPropertyAccessExpression(expression)) return undefined;
  const method = expression.getName().toLowerCase();
  if (!HTTP_METHODS.has(method)) return undefined;
  const receiver = expression.getExpression().getText();
  if (!/^(?:axios|api|apiService|client|http|instance|request)$/i.test(receiver) && !Node.isCallExpression(expression.getExpression())) return undefined;
  const path = stringArgument(call, 0, knownFiles);
  return path ? { method, path, detail: `${receiver}.${method}() request` } : undefined;
}

function extractStringValue(argument: Node | undefined, knownFiles?: Set<string>, depth = 0): string | undefined {
  if (!argument || depth > 8) return undefined;
  if (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) return argument.getLiteralValue();
  if (Node.isTemplateExpression(argument)) {
    return argument.getHead().getLiteralText() + argument.getTemplateSpans()
      .map((span) => `${templateExpression(span.getExpression())}${span.getLiteral().getLiteralText()}`)
      .join("");
  }
  if (Node.isBinaryExpression(argument)) {
    const right = extractStringValue(argument.getRight(), knownFiles, depth + 1);
    if (right) return right;
    const left = extractStringValue(argument.getLeft(), knownFiles, depth + 1);
    if (left) return left;
  }
  if (Node.isIdentifier(argument)) {
    const name = argument.getText();
    const sourceFile = argument.getSourceFile();

    for (const decl of sourceFile.getImportDeclarations()) {
      const defaultImport = decl.getDefaultImport()?.getText();
      const namedImport = decl.getNamedImports().find((n) => (n.getAliasNode()?.getText() ?? n.getName()) === name);
      if (defaultImport === name || namedImport) {
        const spec = decl.getModuleSpecifierValue();
        if (staticAsset(spec)) return spec;
        if (knownFiles) {
          const impFile = localImportPath(sourceFile, spec, knownFiles);
          if (impFile) {
            const impSf = sourceFile.getProject().getSourceFile(impFile);
            const varName = namedImport ? namedImport.getName() : name;
            const targetVar = impSf?.getVariableDeclaration(varName);
            if (targetVar?.getInitializer()) {
              const val = extractStringValue(targetVar.getInitializer(), knownFiles, depth + 1);
              if (val) return val;
            }
          }
        }
      }
    }

    let curr: Node | undefined = argument;
    while (curr && curr !== sourceFile) {
      const block = curr.getFirstAncestorByKind(SyntaxKind.Block);
      if (block) {
        const decl = block.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((d) => d.getName() === name);
        if (decl?.getInitializer()) {
          const val = extractStringValue(decl.getInitializer(), knownFiles, depth + 1);
          if (val) return val;
        }
      }
      curr = curr.getParent();
    }
    const varDecl = sourceFile.getVariableDeclaration(name)
      ?? sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((d) => d.getName() === name);
    if (varDecl?.getInitializer()) {
      return extractStringValue(varDecl.getInitializer(), knownFiles, depth + 1);
    }
  }
  if (Node.isPropertyAccessExpression(argument)) {
    const parts: string[] = [];
    let curr: Node = argument;
    while (Node.isPropertyAccessExpression(curr)) {
      parts.unshift(curr.getName());
      curr = curr.getExpression();
    }
    if (Node.isIdentifier(curr)) {
      const rootName = curr.getText();
      const sourceFile = curr.getSourceFile();
      let rootInitializer: Node | undefined;

      for (const decl of sourceFile.getImportDeclarations()) {
        const defaultImport = decl.getDefaultImport()?.getText();
        const namedImport = decl.getNamedImports().find((n) => (n.getAliasNode()?.getText() ?? n.getName()) === rootName);
        if (defaultImport === rootName || namedImport) {
          const spec = decl.getModuleSpecifierValue();
          if (knownFiles) {
            const impFile = localImportPath(sourceFile, spec, knownFiles);
            if (impFile) {
              const impSf = sourceFile.getProject().getSourceFile(impFile);
              const varName = namedImport ? namedImport.getName() : rootName;
              const targetVar = impSf?.getVariableDeclaration(varName);
              rootInitializer = targetVar?.getInitializer();
            }
          }
          break;
        }
      }

      if (!rootInitializer) {
        const varDecl = sourceFile.getVariableDeclaration(rootName)
          ?? sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((d) => d.getName() === rootName);
        rootInitializer = varDecl?.getInitializer();
      }

      let currentVal = rootInitializer;
      for (const part of parts) {
        if (!currentVal || !Node.isObjectLiteralExpression(currentVal)) {
          currentVal = undefined;
          break;
        }
        const prop = currentVal.getProperty(part);
        if (prop && Node.isPropertyAssignment(prop)) {
          currentVal = prop.getInitializer();
        } else {
          currentVal = undefined;
          break;
        }
      }
      if (currentVal) {
        return extractStringValue(currentVal, knownFiles, depth + 1);
      }
    }
  }
  return undefined;
}

function stringArgument(call: CallExpression, index: number, knownFiles?: Set<string>): string | undefined {
  return extractStringValue(call.getArguments()[index], knownFiles);
}

function templateExpression(expression: Node): string {
  const text = expression.getText();
  if (/process\.env\.PUBLIC_URL/.test(text)) return "";
  if (/^(?:process\.env\.[A-Za-z0-9_$]+|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)$/.test(text)) return `{${text}}`;
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
  let curr: Node | undefined = call;
  while (curr) {
    const ancestor: Node | undefined = curr.getFirstAncestor((node) => Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node));
    if (!ancestor) break;
    if (Node.isFunctionDeclaration(ancestor)) {
      const name = ancestor.getName();
      if (name) return functionNode(file, name, ancestor.getStartLineNumber());
    }
    if (Node.isArrowFunction(ancestor) || Node.isFunctionExpression(ancestor)) {
      const variable = ancestor.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
      const name = variable?.getName();
      if (name) return functionNode(file, name, ancestor.getStartLineNumber());

      const prop = ancestor.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
      if (prop) {
        let path = prop.getName();
        let current: Node | undefined = prop.getParent();
        while (current && Node.isObjectLiteralExpression(current)) {
          const parentProp = current.getParent();
          if (parentProp && Node.isPropertyAssignment(parentProp)) {
            path = `${parentProp.getName()}.${path}`;
            current = parentProp.getParent();
          } else if (parentProp && Node.isVariableDeclaration(parentProp)) {
            path = `${parentProp.getName()}.${path}`;
            break;
          } else {
            break;
          }
        }
        return functionNode(file, path, prop.getStartLineNumber());
      }

      const routeCall = ancestor.getFirstAncestor((p) => Node.isCallExpression(p) && !!routeFromCall(p as CallExpression));
      if (routeCall && Node.isCallExpression(routeCall)) {
        const handler = routeCall.getArguments().at(-1);
        const line = handler?.getStartLineNumber() ?? routeCall.getStartLineNumber();
        return functionNode(file, `<route handler:${line}>`, line);
      }
    }
    curr = ancestor.getParent();
  }
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

function staticAsset(path: string): boolean {
  return !/^https?:\/\//i.test(path) && (
    /\.(?:geojson|png|jpe?g|gif|svg|css|map|woff2?|ico)$/i.test(path.split("?")[0]) ||
    (!/^\/api\//i.test(path) && /\.json$/i.test(path.split("?")[0]))
  );
}
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
  const isJsxFile = /\.[jt]sx$/i.test(file);
  const isPublicScript = /(?:^|\/)(?:public|static|assets)\/.*\.js$/i.test(file);
  const isReactComponent = !isPublicScript && isJsxFile && /^[A-Z]/.test(name);
  return {
    id: `function:${file}:${name}`,
    kind: isPublicScript ? "client_script" : "function",
    label: name,
    location: { file, line },
    attributes: {
      isReactComponent,
      isClientScript: isPublicScript,
      isHook: /^use[A-Z]/.test(name),
      isProvider: isReactComponent && /Provider$/.test(name),
    },
  };
}

function location(node: Node, file: string) { return { file, line: node.getStartLineNumber() }; }
function evidence(file: string, line: number, detail: string): Evidence { return { location: { file, line }, method: "typescript_compiler", status: "statically_established", confidence: "high", detail }; }
