const selection = figma.currentPage.selection;

function errorOne(object: BaseNodeMixin, kind: String) {
	note = `Can't split! ${object.name} has only one ${kind}`;
}

function errorSelect() {
	note = "Select Vector node(s)";
}

function copyVectorProps(to: VectorNode, from: VectorNode) {
	if (typeof from.fills !== "symbol")
		to.fills = from.fills;
	to.strokes = from.strokes;
	to.strokeAlign = from.strokeAlign;
	to.strokeCap = from.strokeCap;
	to.strokeJoin = from.strokeJoin;
	to.strokeWeight = from.strokeWeight;
	to.opacity = from.opacity;
	to.effects = from.effects;
	to.constraints = {horizontal: "SCALE", vertical: "SCALE"};
}

let note = null;
let processed = 0;

const CommandFills = "f";
const CommandShapes = "s";
const CommandSegments = "l";

const select = [];

if (selection.length > 0) {

	switch (figma.command) {
		case CommandFills:
			process(fills);
			break;
		case CommandShapes:
			process(shapes);
			break;
		case CommandSegments:
			process(segments);
			break;
	}

} else {
	errorSelect();
}

function process(processor) {
	selection.forEach(object => {
		switch (object.type) {
			case "VECTOR": {
				processor(object);
				break;
			}
			case "ELLIPSE":
			case "LINE":
			case "POLYGON":
			case "RECTANGLE":
			case "STAR": {
				errorOne(object, "fill region");
				break;
			}
			default:
				errorSelect();
				break;
		}
	});
}

function fills(vector: VectorNode) {

	const vectorNetwork = vector.vectorNetwork;

	if (vectorNetwork.regions.length > 1) {

		const vectors = [];

		vectorNetwork.regions.forEach(region => {

			const newVector = figma.createVector();

			const vertices = [];
			const regions = [];
			const segments = [];
			const fills = [];

			const segmentsMap = new Map<number, number>();
			const vertexesMap = new Map<number, number>();

			const fillStyleId = region.fillStyleId?.length ? region.fillStyleId : null;
			
			region.loops.forEach(
				(loop, index) => {
					const loops = [];
					loop.forEach(si => {
						if (!segmentsMap.has(si)) {
							const s = vectorNetwork.segments[si];
							if (!vertexesMap.has(s.start)) {
								vertices.push(vectorNetwork.vertices[s.start]);
								vertexesMap.set(s.start, vertices.length - 1);
							}
							if (!vertexesMap.has(s.end)) {
								vertices.push(vectorNetwork.vertices[s.end]);
								vertexesMap.set(s.end, vertices.length - 1);
							}
							if (!segmentsMap.has(si)) {
								segments.push({
									start: vertexesMap.get(s.start),
									end: vertexesMap.get(s.end),
									tangentStart: s.tangentStart,
									tangentEnd: s.tangentEnd
								});
								segmentsMap.set(si, segments.length - 1);
							}
						}
						loops.push(segmentsMap.get(si));
					});
					regions.push(loops);
					if (!fillStyleId && region.fills?.length)
						fills.push(region.fills[index]);
				}
			);

			newVector.vectorNetwork = {
				vertices, segments,
				regions: [{ windingRule: region.windingRule, loops: regions }],
			};
			
			if (fillStyleId) {
				newVector.fillStyleId = fillStyleId;
			} else if (fills.length) {
				newVector.fills = fills;
			}

			copyVectorProps(newVector, vector);

			vectors.push(newVector);

		});

		const hasStrokes = vector.strokes.length > 0;

		let original = null;
		if (hasStrokes) {
			original = figma.createVector();
			original.vectorNetwork = vector.vectorNetwork;
			copyVectorProps(original, vector);
			original.fills = [];
			vectors.push(original);
		}

		const group = groupVectors(vector, vectors);
		if (hasStrokes) group.insertChild(0, original);

		processed++;

	} else {

		errorOne(vector, "fill region");
	}
}

function shapes(vector: VectorNode) {

	const vectorNetwork = vector.vectorNetwork;

	interface Vertex {
		vertex: VectorVertex;
		links: Set<Vertex>;
		index: number;
		newIndex: number;
	}

	let vertexIndex = 0;

	const getVector = (index): Vertex => ({
		links: new Set<Vertex>(), vertex: vectorNetwork.vertices[index],
		index: vertexIndex++, newIndex: 0
	});

	const vertexesMap = new Map<number, Vertex>();

	vectorNetwork.segments.forEach(segment => {

		if (!vertexesMap.has(segment.start)) {
			vertexesMap.set(segment.start, getVector(segment.start));
		}

		if (!vertexesMap.has(segment.end)) {
			vertexesMap.set(segment.end, getVector(segment.end));
		}

		const start = vertexesMap.get(segment.start);
		const end = vertexesMap.get(segment.end);

		if (!start.links.has(end)) start.links.add(end);
		if (!end.links.has(start)) end.links.add(start);

	});

	const vertexesToVisit = new Set<Vertex>();
	for (const vertex of vertexesMap.values()) vertexesToVisit.add(vertex);

	interface Shape {
		vertices: Vertex[];
		segments: VectorSegment[];
		regions: VectorRegion[];
	}

	const getShape = () => {
		return {vertices: [], segments: [], regions: []}
	};

	const shapes: Shape[] = [];

	function visit(vertex, vertices, index) {
		vertex.newIndex = index;
		vertex.index = vertices.length;
		vertices.push(vertex);
		vertexesToVisit.delete(vertex);
		vertex.links.forEach(vertex => {
			if (vertexesToVisit.has(vertex)) visit(vertex, vertices, index);
		});
	}

	while (true) {
		const vertex: Vertex = vertexesToVisit.values().next().value;
		if (vertex) {
			const shape = getShape();
			visit(vertex, shape.vertices, shapes.length);
			shape.vertices.sort((a, b) => a.index - b.index);
			shapes.push(shape);
		} else break;
	}

	if (shapes.length > 1) {

		const vectors = [];
		const segmentsMap = new Map<number, number>();

		vectorNetwork.segments.forEach((segment, index) => {
			const vertex = vertexesMap.get(segment.start);
			const shape = shapes[vertex.newIndex];
			segmentsMap.set(index, shape.segments.length);
			shape.segments.push({
				start: vertex.index, end: vertexesMap.get(segment.end).index,
				tangentStart: segment.tangentStart, tangentEnd: segment.tangentEnd
			});
		});

		vectorNetwork.regions.forEach(region => {
			const vertex = vertexesMap.get(vectorNetwork.segments[region.loops[0][0]].start);
			const shape = shapes[vertex.newIndex];
			shape.regions.push({
				windingRule: region.windingRule,
				loops: region.loops.map(
					loops => loops.map(
						segmentIndex => segmentsMap.get(segmentIndex)
					)
				)
			});
		});

		shapes.forEach(shape => {

			const newVector = figma.createVector();

			const vertices = [];
			shape.vertices.forEach(vertex => vertices.push(vertex.vertex));

			newVector.vectorNetwork = {
				vertices: vertices,
				regions: shape.regions,
				segments: shape.segments
			};

			copyVectorProps(newVector, vector);
			vectors.push(newVector);
		});

		groupVectors(vector, vectors);
		processed++;

	} else {

		errorOne(vector, "shape");
	}

}

function segments(vector: VectorNode) {

	const vectorNetwork = vector.vectorNetwork;

	if (vectorNetwork.segments.length > 1) {

		const vectors = [];

		vectorNetwork.segments.forEach(segment => {

			const newVector = figma.createVector();

			newVector.vectorNetwork = {
				vertices: [vectorNetwork.vertices[segment.start], vectorNetwork.vertices[segment.end]],
				segments: [{
					start: 0, end: 1,
					tangentStart: segment.tangentStart,
					tangentEnd: segment.tangentEnd
				}],
				regions: []
			};

			copyVectorProps(newVector, vector);

			vectors.push(newVector);

		});

		const hasFills = (<ReadonlyArray<Paint>>vector.fills).length > 0;

		let original = null;

		if (hasFills) {
			original = figma.createVector();
			original.vectorNetwork = vector.vectorNetwork;
			copyVectorProps(original, vector);
			original.strokes = [];
			vectors.push(original);
		}

		const group = groupVectors(vector, vectors);
		if (hasFills) group.insertChild(0, original);

		processed++;

	} else {

		errorOne(vector, "segment");
	}

}

function groupVectors(vector, vectors) {

	const group = figma.group(
		vectors, vector.parent,
		vector.parent.children.indexOf(vector)
	);

	group.x = vector.x;
	group.y = vector.y;
	group.rotation = vector.rotation;
	group.blendMode = vector.blendMode;
	group.isMask = vector.isMask;
	group.backgrounds = [];
	group.name = vector.name;

	vector.remove();

	select.push(group);

	return group;
}

if (note && !processed) figma.notify(note);

if (select.length > 0) figma.currentPage.selection = select;

figma.closePlugin();