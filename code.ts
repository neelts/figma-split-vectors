const selection = figma.currentPage.selection;

function errorOne(object: BaseNodeMixin, kind: string) {
	note = `Can't split! ${object.name} has only one ${kind}`;
}

function errorSelect() {
	note = "Select Vector node(s)";
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

function process(processor: (object: VectorNode) => void){
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

		vectorNetwork.regions.forEach(async region => {

			const newVector = vector.clone();

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

			await newVector.setVectorNetworkAsync({
				vertices, segments,
				regions: [{ windingRule: region.windingRule, loops: regions }],
			});
			
			if (fillStyleId) {
				await newVector.setFillStyleIdAsync(fillStyleId);
			} else if (fills.length) {
				newVector.fills = fills;
			}

			vectors.push(newVector);

		});

		const hasStrokes = vector.strokes.length > 0;

		let original = null;
		if (hasStrokes) {
			original = vector.clone();
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

	const getVector = (index: number) => ({
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

	function visit(vertex: Vertex, vertices: Vertex[], index: number) {
		vertex.newIndex = index;
		vertex.index = vertices.length;
		vertices.push(vertex);
		vertexesToVisit.delete(vertex);
		vertex.links.forEach(vertex => {
			if (vertexesToVisit.has(vertex)) visit(vertex, vertices, index);
		});
	}

	const vertex: Vertex = null;
	do {
		if (vertex == vertexesToVisit.values().next().value) {
			const shape = getShape();
			visit(vertex, shape.vertices, shapes.length);
			shape.vertices.sort((a, b) => a.index - b.index);
			shapes.push(shape);
		} else break;
	} while (vertex);

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

		shapes.forEach(async shape => {

			const newVector = vector.clone();

			const vertices = [];
			shape.vertices.forEach(vertex => vertices.push(vertex.vertex));

			await newVector.setVectorNetworkAsync({
				vertices: vertices,
				regions: shape.regions,
				segments: shape.segments
			});
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

		vectorNetwork.segments.forEach(async segment => {

			const newVector = vector.clone();

			await newVector.setVectorNetworkAsync({
				vertices: [vectorNetwork.vertices[segment.start], vectorNetwork.vertices[segment.end]],
				segments: [{
					start: 0, end: 1,
					tangentStart: segment.tangentStart,
					tangentEnd: segment.tangentEnd
				}],
				regions: []
			});

			vectors.push(newVector);

		});

		const hasFills = (<ReadonlyArray<Paint>>vector.fills).length > 0;

		let original = null;

		if (hasFills) {
			original = vector.clone();
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

function groupVectors(vector: VectorNode, vectors: VectorNode[]) {

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