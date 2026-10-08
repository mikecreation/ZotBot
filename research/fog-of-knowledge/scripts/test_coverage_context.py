"""The research queue sees every field, regardless of display priority limits."""
import copy
import unittest

import nemesis_context as context


class CoverageContextTests(unittest.TestCase):
    def test_inventory_keeps_all_records_and_domains_with_zero_priority_items(self):
        graph = context.load_graph()
        context.merge_runtime_ologies(graph)
        original = copy.deepcopy(graph)
        packet = context.build_context(graph, 0)
        inventory = packet['coverage_inventory']
        self.assertEqual(len(inventory), len(graph['nodes']))
        self.assertEqual({n['id'] for n in inventory}, {n['id'] for n in graph['nodes']})
        self.assertEqual({n['domain'] for n in inventory}, {d['id'] for d in graph['domains']})
        self.assertEqual(packet['frontier_nodes'], [])
        self.assertEqual(packet['priority_source_gaps'], [])
        self.assertEqual(graph, original)

    def test_inventory_preserves_exact_identity_and_source_urls(self):
        graph = context.load_graph()
        packet = context.build_context(graph, 1)
        indexed = {n['id']: n for n in packet['coverage_inventory']}
        for node in graph['nodes']:
            with self.subTest(node=node['id']):
                self.assertEqual(indexed[node['id']]['label'], node['label'])
                self.assertEqual(indexed[node['id']]['source_urls'], sorted({s if isinstance(s, str) else s['url']
                    for s in node.get('sources', []) if isinstance(s, str) or s.get('url')}))


if __name__ == '__main__':
    unittest.main()
